import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Booking, BillingRecord, Compensation, Incident, Review, Room, RoomType,
  CleaningTask, BreakfastOrder, LinenStock, InventoryDay,
} from '../entities';
import { dateStr, nightsBetween, num, round2 } from '../common';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(BillingRecord) private bills: Repository<BillingRecord>,
    @InjectRepository(Compensation) private comps: Repository<Compensation>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(RoomType) private roomTypes: Repository<RoomType>,
    @InjectRepository(CleaningTask) private cleaning: Repository<CleaningTask>,
    @InjectRepository(BreakfastOrder) private breakfasts: Repository<BreakfastOrder>,
    @InjectRepository(LinenStock) private linen: Repository<LinenStock>,
    @InjectRepository(InventoryDay) private invDays: Repository<InventoryDay>,
  ) {}

  /** 运营总览（店主首页） */
  async dashboard(date: string) {
    const active = await this.bookings.createQueryBuilder('b')
      .leftJoinAndSelect('b.channel', 'c')
      .leftJoinAndSelect('b.roomType', 'rt')
      .leftJoinAndSelect('b.room', 'r')
      .where('b.status IN (:...ss)', { ss: ['reserved', 'checked_in'] })
      .andWhere('b.arrival_date <= :date AND b.departure_date > :date', { date })
      .getMany();
    const allRooms = await this.rooms.find();
    const arrivals = await this.bookings.count({ where: { arrivalDate: date, status: In(['reserved', 'checked_in']) } } as any);
    const departures = await this.bookings.count({ where: { departureDate: date, status: In(['reserved', 'checked_in']) } } as any);
    const [todayCleaning, todayBreakfast, openIncidents, stockRows, reviewOpen] = await Promise.all([
      this.cleaning.find({ where: { scheduledDate: date } }),
      this.breakfasts.find({ where: { date } }),
      this.incidents.count({ where: { status: In(['open', 'processing']) } }),
      this.linen.find(),
      this.reviews.count({ where: { status: In(['posted', 'replied']) } }),
    ]);
    const byType: Record<number, { roomTypeId: number; name: string; total: number; occupied: number }> = {};
    for (const r of allRooms) {
      const id = r.roomType.id;
      if (!byType[id]) byType[id] = { roomTypeId: id, name: r.roomType.name, total: 0, occupied: 0 };
      byType[id].total++;
    }
    for (const b of active) {
      if (b.room && byType[b.roomType.id]) byType[b.roomType.id].occupied++;
    }
    return {
      date,
      occupancy: Object.values(byType),
      inHouseBookings: active.length,
      arrivalsToday: arrivals,
      departuresToday: departures,
      cleaning: {
        total: todayCleaning.length,
        pending: todayCleaning.filter((t) => t.status === 'pending').length,
        blocked: todayCleaning.filter((t) => t.status === 'blocked').length,
        done: todayCleaning.filter((t) => t.status === 'done').length,
      },
      breakfast: {
        portions: todayBreakfast.reduce((s, o) => s + o.portions, 0),
        dietary: todayBreakfast.filter((o) => o.dietaryRestrictions).map((o) => ({
          bookingCode: o.booking?.code, guest: o.booking?.guestName, restriction: o.dietaryRestrictions,
        })),
        shortage: todayBreakfast.filter((o) => o.status === 'shortage').length,
      },
      linen: stockRows[0] || null,
      openIncidents,
      pendingReviews: reviewOpen,
    };
  }

  /** 旺季复盘：渠道/房型利润、差评归因、异常结构、问题定性 */
  async seasonReview(from: string, to: string) {
    const [types, allRooms, bookingList, billList, incList, reviewList, compList] = await Promise.all([
      this.roomTypes.find(),
      this.rooms.find(),
      this.bookings.createQueryBuilder('b')
        .leftJoinAndSelect('b.channel', 'c')
        .leftJoinAndSelect('b.roomType', 'rt')
        .where('b.status <> :cancel', { cancel: 'cancelled' })
        .andWhere('b.arrival_date <= :to AND b.departure_date >= :from', { from, to })
        .getMany(),
      this.bills.createQueryBuilder('br')
        .leftJoinAndSelect('br.booking', 'b')
        .leftJoinAndSelect('b.channel', 'c')
        .leftJoinAndSelect('b.roomType', 'rt')
        .where('b.departure_date >= :from AND b.departure_date <= :to', { from, to })
        .getMany(),
      this.incidents.createQueryBuilder('i')
        .where('i.occurred_at >= :f AND i.occurred_at < (:t)::date + 1', { f: from, t: to })
        .getMany(),
      this.reviews.createQueryBuilder('rv')
        .leftJoinAndSelect('rv.booking', 'b')
        .leftJoinAndSelect('rv.channel', 'c')
        .where('rv.created_at >= :f AND rv.created_at < (:t)::date + 1', { f: from, t: to })
        .getMany(),
      this.comps.createQueryBuilder('cp')
        .leftJoinAndSelect('cp.booking', 'b')
        .where('cp.issued_at >= :f AND cp.issued_at < (:t)::date + 1 AND cp.status = :st', { f: from, t: to, st: 'issued' })
        .getMany(),
    ]);

    const days = nightsBetween(from, to).length + 1; // 季节窗口按闭区间 [from,to] 计天（to 为最后离店日）
    const roomCounts: Record<number, number> = {};
    for (const r of allRooms) roomCounts[r.roomType.id] = (roomCounts[r.roomType.id] || 0) + 1;

    // 季节夜集合为闭区间 [from,to]；订单占用夜为 [arrival, departure-1]，取交集
    const overlapNights = (b: Booking) => {
      const s = b.arrivalDate < from ? from : b.arrivalDate;
      const toNext = dateStr(new Date(new Date(to + 'T00:00:00').getTime() + 86400000));
      const e = b.departureDate > toNext ? toNext : b.departureDate;
      return s < e ? nightsBetween(s, e).length : 0;
    };

    const physicalRoomNights = allRooms.length * days;
    const soldNights = bookingList.reduce((s, b) => s + overlapNights(b), 0);

    // 以结算单为利润口径
    const sumBy = <K extends string | number>(keyFn: (br: BillingRecord) => K) => {
      const map = new Map<K, any>();
      for (const br of billList) {
        const k = keyFn(br);
        if (!map.has(k)) map.set(k, {
          key: k, bookings: 0, roomNights: 0,
          roomFee: 0, extraBedFee: 0, breakfastFee: 0, addOnFee: 0,
          revenue: 0, commission: 0, refundCost: 0, couponCost: 0, cashCost: 0, depositDeduction: 0, netIncome: 0,
        });
        const m = map.get(k);
        m.bookings++;
        m.roomNights += br.booking.nights;
        m.roomFee += num(br.roomFee); m.extraBedFee += num(br.extraBedFee);
        m.breakfastFee += num(br.breakfastFee); m.addOnFee += num(br.addOnFee);
        m.revenue += num(br.roomFee) + num(br.extraBedFee) + num(br.breakfastFee) + num(br.addOnFee);
        m.commission += num(br.commissionAmount);
        m.refundCost += num(br.refundCost); m.couponCost += num(br.couponCost);
        m.cashCost += num(br.cashCost); m.depositDeduction += num(br.depositDeduction);
        m.netIncome += num(br.netIncome);
      }
      return [...map.values()].map((m) => {
        for (const k of Object.keys(m)) if (typeof m[k] === 'number') m[k] = round2(m[k]);
        m.adr = round2(m.roomNights ? m.roomFee / m.roomNights : 0);
        m.margin = m.revenue ? round2((m.netIncome / m.revenue) * 100) : 0;
        return m;
      });
    };

    const channelMap = new Map(bookingList.map((b) => [b.id, b.channel]));
    const byChannel = sumBy((br) => br.booking.channel.name).map((m) => ({ ...m, channel: m.key }));
    const byRoomType = sumBy((br) => br.booking.roomType.name).map((m) => ({ ...m, roomType: m.key }));

    // 差评归因
    const reviewByCategory: Record<string, number> = { hardware: 0, service: 0, oversell: 0, food_prep: 0, other: 0 };
    let ratingSum = 0;
    for (const r of reviewList) {
      reviewByCategory[r.category] = (reviewByCategory[r.category] || 0) + 1;
      ratingSum += r.rating;
    }
    // 异常结构
    const incidentByType: Record<string, number> = {};
    const incidentCompCost: Record<string, number> = {};
    for (const i of incList) {
      incidentByType[i.type] = (incidentByType[i.type] || 0) + 1;
    }
    for (const c of compList) {
      const inc = c.incidentId ? incList.find((i) => i.id === c.incidentId) : null;
      const key = inc ? inc.type : 'other';
      incidentCompCost[key] = round2((incidentCompCost[key] || 0) + num(c.amount));
    }

    // 每房型问题定性：价格策略 / 履约能力 / 个别客诉
    const bookingTypeMap = new Map(bookingList.map((b) => [b.id, b]));
    const diagnosisByType = types.map((t) => {
      const tBookings = bookingList.filter((b) => b.roomType.id === t.id);
      const tBills = billList.filter((br) => br.booking.roomType.id === t.id);
      const tBookingIds = new Set(tBookings.map((b) => b.id));
      const tIncidents = incList.filter((i) => i.bookingId != null && tBookingIds.has(i.bookingId));
      const tReviews = reviewList.filter((r) => r.bookingId && tBookingIds.has(r.bookingId));
      const nights = tBookings.reduce((s, b) => s + overlapNights(b), 0);
      const physical = (roomCounts[t.id] || 0) * days;
      const occupancy = physical ? round2((nights / physical) * 100) : 0;
      const adr = tBills.length && nights ? round2(tBills.reduce((s, br) => s + num(br.roomFee), 0) / nights) : 0;
      const adrRatio = num(t.basePrice) ? round2(adr / num(t.basePrice)) : 1;
      const oversell = tIncidents.filter((i) => i.type === 'oversell').length;
      const linenDelay = tIncidents.filter((i) => i.type === 'linen_delay').length;
      const breakfastShortage = tIncidents.filter((i) => i.type === 'breakfast_shortage').length;
      const roomFault = tIncidents.filter((i) => i.type === 'room_fault').length;
      const compCost = round2(tBills.reduce((s, br) => s + num(br.couponCost) + num(br.refundCost) + num(br.cashCost), 0));
      const tags: string[] = [];
      if (adrRatio < 1 || (occupancy < 60 && adrRatio < 1.1)) tags.push('价格策略问题');
      if (oversell + linenDelay + breakfastShortage + roomFault > 0) tags.push('履约能力问题');
      if (tReviews.some((r) => r.rating <= 3) && oversell + linenDelay + breakfastShortage + roomFault === 0) tags.push('个别客诉');
      return {
        roomTypeId: t.id, name: t.name, occupancy, adr, basePrice: num(t.basePrice), adrRatio,
        oversell, linenDelay, breakfastShortage, roomFault,
        badReviews: tReviews.filter((r) => r.rating <= 3).length,
        compCost, tags: tags.length ? tags : ['表现正常'],
      };
    });

    const totalNet = round2(billList.reduce((s, br) => s + num(br.netIncome), 0));
    const totalRevenue = round2(billList.reduce((s, br) => s + num(br.roomFee) + num(br.extraBedFee) + num(br.breakfastFee) + num(br.addOnFee), 0));
    const totalCommission = round2(billList.reduce((s, br) => s + num(br.commissionAmount), 0));
    const totalComp = round2(compList.reduce((s, c) => s + num(c.amount), 0));

    return {
      period: { from, to, days },
      kpi: {
        bookings: billList.length,
        soldNights, physicalRoomNights,
        occupancyRate: physicalRoomNights ? round2((soldNights / physicalRoomNights) * 100) : 0,
        revenue: totalRevenue, commission: totalCommission,
        compensationCost: totalComp, netIncome: totalNet,
        avgRating: reviewList.length ? round2(ratingSum / reviewList.length) : null,
      },
      byChannel,
      byRoomType,
      reviews: { total: reviewList.length, avgRating: reviewList.length ? round2(ratingSum / reviewList.length) : null, byCategory: reviewByCategory },
      incidents: { byType: incidentByType, compCostByType: incidentCompCost },
      diagnosis: diagnosisByType,
    };
  }

  /** 下一轮节假日排房建议：按超卖/布草/早餐/补偿成本调减可售房量，给出调价方向 */
  async allocationPlan(pastFrom: string, pastTo: string, nextFrom: string, nextTo: string, apply: boolean) {
    const review = await this.seasonReview(pastFrom, pastTo);
    const nextDates = nightsBetween(nextFrom, nextTo);
    const allRooms = await this.rooms.find();
    const counts: Record<number, number> = {};
    for (const r of allRooms) counts[r.roomType.id] = (counts[r.roomType.id] || 0) + 1;

    const recommendations = review.diagnosis.map((d) => {
      const physicalRooms = counts[d.roomTypeId] || 0;
      const reasons: string[] = [];
      let reduction = 0;
      if (d.oversell > 0) reasons.push(`发生 ${d.oversell} 次渠道超卖`);
      if (d.linenDelay >= 2) { reduction += 1; reasons.push(`布草延迟 ${d.linenDelay} 次，需留打扫缓冲`); }
      if (d.breakfastShortage >= 2) { reduction += 1; reasons.push(`早餐供应不足 ${d.breakfastShortage} 次，厨房产能需匹配房量`); }
      if (d.compCost > 0) reasons.push(`补偿成本 ${d.compCost} 元`);
      let priceAdjustPct = 0;
      if (d.oversell > 0 && reduction === 0) {
        priceAdjustPct = 12;
        reasons.push('需求旺盛且无履约事故，建议旺季提价 12%，不削减房量');
      } else if (reduction > 0) {
        reduction = Math.min(reduction, Math.floor(physicalRooms / 2));
        priceAdjustPct = 5;
        reasons.push(`存在履约短板，可售房量调减 ${reduction} 间，价格小幅上调 5%`);
      } else if (d.occupancy >= 90) {
        priceAdjustPct = 10;
        reasons.push('入住率 ≥90% 且履约稳定，建议提价 10%');
      } else if (d.occupancy < 60) {
        priceAdjustPct = -10;
        reasons.push('入住率不足 60%，建议降价 10% 引流');
      } else {
        reasons.push('房量与价格维持不变');
      }
      return {
        roomTypeId: d.roomTypeId, name: d.name,
        physicalRooms,
        recommendedSellable: physicalRooms - reduction,
        reduction, priceAdjustPct,
        occupancy: d.occupancy,
        reasons, tags: d.tags,
      };
    });

    if (apply) {
      for (const date of nextDates) {
        for (const rec of recommendations) {
          let row = await this.invDays.findOne({ where: { roomTypeId: rec.roomTypeId, date } });
          if (!row) row = this.invDays.create({ roomTypeId: rec.roomTypeId, date });
          row.sellableRooms = rec.recommendedSellable!;
          row.note = `按上轮复盘自动调减：${rec.reasons.join('；')}`;
          await this.invDays.save(row);
        }
      }
    }
    return {
      pastPeriod: { from: pastFrom, to: pastTo },
      nextPeriod: { from: nextFrom, to: nextTo, dates: nextDates },
      applied: apply,
      recommendations,
    };
  }
}
