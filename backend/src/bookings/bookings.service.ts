import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import {
  Booking, Channel, RoomType, Room, PriceCalendar, InventoryDay,
  CleaningTask, BreakfastOrder, Incident, LinenRequest, MaintenanceTicket,
  Review, Compensation, BillingRecord,
} from '../entities';
import {
  num, round2, genCode, nightsBetween, breakfastDates, todayStr,
} from '../common';

export interface CreateBookingDto {
  channelCode: string;
  roomTypeId: number;
  guestName: string;
  guestPhone?: string;
  arrivalDate: string;
  departureDate: string;
  adults?: number;
  children?: number;
  extraBeds?: number;
  pets?: number;
  breakfastPortions?: number;
  dietaryRestrictions?: string;
  depositAmount?: number;
  invoiceRequired?: boolean;
  invoiceTitle?: string;
  forceOversell?: boolean;
  roomId?: number;
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Channel) private channels: Repository<Channel>,
    @InjectRepository(RoomType) private roomTypes: Repository<RoomType>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(PriceCalendar) private priceCal: Repository<PriceCalendar>,
    @InjectRepository(InventoryDay) private invDays: Repository<InventoryDay>,
    @InjectRepository(CleaningTask) private cleaning: Repository<CleaningTask>,
    @InjectRepository(BreakfastOrder) private breakfasts: Repository<BreakfastOrder>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(LinenRequest) private linenReqs: Repository<LinenRequest>,
    @InjectRepository(MaintenanceTicket) private maintenance: Repository<MaintenanceTicket>,
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Compensation) private compensations: Repository<Compensation>,
    @InjectRepository(BillingRecord) private billing: Repository<BillingRecord>,
    private ds: DataSource,
  ) {}

  // ---------------- 查询 ----------------

  async list(filter: { status?: string; channelCode?: string; from?: string; to?: string; keyword?: string }) {
    const qb = this.bookings.createQueryBuilder('b')
      .leftJoinAndSelect('b.channel', 'c')
      .leftJoinAndSelect('b.roomType', 'rt')
      .leftJoinAndSelect('b.room', 'r')
      .orderBy('b.arrival_date', 'ASC')
      .addOrderBy('b.id', 'ASC');
    if (filter.status) qb.andWhere('b.status = :s', { s: filter.status });
    if (filter.channelCode) qb.andWhere('c.code = :cc', { cc: filter.channelCode });
    if (filter.from) qb.andWhere('b.departure_date > :from', { from: filter.from });
    if (filter.to) qb.andWhere('b.arrival_date < :to', { to: filter.to });
    if (filter.keyword) qb.andWhere('(b.guest_name ILIKE :kw OR b.code ILIKE :kw OR b.guest_phone ILIKE :kw)', { kw: `%${filter.keyword}%` });
    const rows = await qb.getMany();
    const bills = await this.billing.find({ where: { bookingId: In(rows.map((r) => r.id)) } });
    const billedIds = new Set(bills.map((b) => b.bookingId));
    return rows.map((b) => ({ ...b, settled: billedIds.has(b.id) }));
  }

  /** 住宿链路：订单 + 保洁 + 布草 + 维修 + 早餐 + 事件 + 差评 + 补偿 + 结算 */
  async detail(id: number) {
    const booking = await this.bookings.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('订单不存在');
    const [cleaningTasks, linenRequests, tickets, breakfastOrders, incidentList, reviewList, comps, bill] = await Promise.all([
      this.cleaning.find({ where: { booking: { id } }, order: { scheduledDate: 'ASC' } }),
      this.linenReqs.createQueryBuilder('lr')
        .leftJoinAndSelect('lr.cleaningTask', 'ct')
        .where('ct.booking_id = :id', { id }).getMany(),
      this.maintenance.find({ where: { booking: { id } }, order: { reportedAt: 'DESC' } }),
      this.breakfasts.find({ where: { bookingId: id }, order: { date: 'ASC' } }),
      this.incidents.find({ where: { bookingId: id }, order: { occurredAt: 'DESC' } }),
      this.reviews.find({ where: { bookingId: id } }),
      this.compensations.find({ where: { bookingId: id }, order: { issuedAt: 'DESC' } }),
      this.billing.findOne({ where: { bookingId: id } }),
    ]);
    return { booking, cleaningTasks, linenRequests, tickets, breakfastOrders, incidents: incidentList, reviews: reviewList, compensations: comps, billing: bill };
  }

  // ---------------- 库存/可售 ----------------

  /** 某房型在某日期区间内的房态日历：每日 物理房数/可售/已订/在维修/剩余 */
  async availability(roomTypeId: number, from: string, to: string) {
    const rt = await this.roomTypes.findOne({ where: { id: roomTypeId } });
    if (!rt) throw new NotFoundException('房型不存在');
    const allRooms = await this.rooms.find({ where: { roomType: { id: roomTypeId } } });
    const dates = nightsBetween(from, to);
    const activeBookings = await this.bookings.createQueryBuilder('b')
      .leftJoinAndSelect('b.room', 'broom')
      .where('b.room_type_id = :rtid', { rtid: roomTypeId })
      .andWhere('b.status IN (:...ss)', { ss: ['reserved', 'checked_in'] })
      .andWhere('b.arrival_date < :to AND b.departure_date > :from', { from, to })
      .getMany();
    const tickets = await this.maintenance.createQueryBuilder('m')
      .leftJoinAndSelect('m.room', 'r')
      .where('r.room_type_id = :rtid', { rtid: roomTypeId })
      .andWhere('m.blocks_room = true AND m.status <> :resolved', { resolved: 'resolved' })
      .andWhere('(m.block_date_from IS NULL OR m.block_date_from <= :to)', { to })
      .andWhere('(m.block_date_to IS NULL OR m.block_date_to >= :from)', { from })
      .getMany();
    const invRows = await this.invDays.find({ where: { roomTypeId, date: In(dates) } });
    const invMap = new Map(invRows.map((r) => [r.date, r]));

    return dates.map((date) => {
      const occupied = activeBookings.filter((b) => b.arrivalDate <= date && date < b.departureDate);
      const blockedRoomIds = new Set<number>();
      for (const t of tickets) {
        if (!t.room) continue;
        const s = t.blockDateFrom || from, e = t.blockDateTo || to;
        if (s <= date && date <= e) blockedRoomIds.add(t.room.id);
      }
      const physical = allRooms.length;
      const inMaintenance = blockedRoomIds.size;
      const inv = invMap.get(date);
      const sellable = inv ? Math.min(inv.sellableRooms, physical) : physical;
      const booked = occupied.length;
      return {
        date,
        physical,
        sellable,
        inMaintenance,
        booked,
        oversold: booked > sellable,
        remaining: sellable - booked,
        inventoryNote: inv?.note || null,
        bookings: occupied.map((b) => ({ id: b.id, code: b.code, roomId: b.room?.id || null, guestName: b.guestName, status: b.status, forceOversold: b.forceOversold })),
      };
    });
  }

  /** 为订单挑选一间在住期内空闲、未被维修封锁的房间 */
  private async pickRoom(roomTypeId: number, arrival: string, departure: string, preferredRoomId?: number): Promise<Room | null> {
    const allRooms = await this.rooms.find({ where: preferredRoomId ? { id: preferredRoomId } : { roomType: { id: roomTypeId } } });
    for (const room of allRooms) {
      if (room.roomType.id !== roomTypeId && !preferredRoomId) continue;
      const clash = await this.bookings.createQueryBuilder('b')
        .where('b.room_id = :rid', { rid: room.id })
        .andWhere('b.status IN (:...ss)', { ss: ['reserved', 'checked_in'] })
        .andWhere('b.arrival_date < :dep AND b.departure_date > :arr', { dep: departure, arr: arrival })
        .getCount();
      const maint = await this.maintenance.createQueryBuilder('m')
        .where('m.room_id = :rid AND m.blocks_room = true AND m.status <> :resolved', { rid: room.id, resolved: 'resolved' })
        .andWhere('(m.block_date_from IS NULL OR m.block_date_from < :dep)', { dep: departure })
        .andWhere('(m.block_date_to IS NULL OR m.block_date_to >= :arr)', { arr: arrival })
        .getCount();
      if (clash === 0 && maint === 0) return room;
    }
    return null;
  }

  // ---------------- 费用 ----------------

  async dailyPriceMap(rt: RoomType, dates: string[]): Promise<{ date: string; price: number }[]> {
    const rows = await this.priceCal.find({ where: { roomTypeId: rt.id, date: In(dates) } });
    const map = new Map(rows.map((r) => [r.date, num(r.price)]));
    return dates.map((date) => ({ date, price: map.has(date) ? map.get(date)! : num(rt.basePrice) }));
  }

  /** 重算订单金额（临时加人/宠物/加床/早餐/佣金） */
  async recalc(b: Booking): Promise<Booking> {
    const rt = await this.roomTypes.findOne({ where: { id: b.roomType.id } });
    const dates = nightsBetween(b.arrivalDate, b.departureDate);
    const daily = await this.dailyPriceMap(rt, dates);
    b.dailyRates = daily;
    b.roomFee = round2(daily.reduce((s, d) => s + d.price, 0));
    b.extraBedFee = round2(num(b.extraBeds) * num(rt.extraBedPrice) * dates.length);
    b.breakfastFee = round2(num(b.breakfastPortions) * num(rt.breakfastPrice) * dates.length);
    const extraPerson = b.extraGuests > 0 ? b.extraGuests * 100 * dates.length : 0;
    const petFee = b.pets > 0 ? b.pets * num(rt.petFee) * dates.length : 0;
    b.addOnFee = round2(extraPerson + petFee);
    const ch = await this.channels.findOne({ where: { id: b.channel.id } });
    b.commissionRate = ch ? num(ch.commissionRate) : 0;
    b.commissionAmount = round2((num(b.roomFee) + num(b.extraBedFee) + num(b.addOnFee)) * b.commissionRate);
    return b;
  }

  // ---------------- 下单 ----------------

  async create(dto: CreateBookingDto) {
    if (!dto.arrivalDate || !dto.departureDate || dto.arrivalDate >= dto.departureDate) {
      throw new BadRequestException('入住/离店日期不合法');
    }
    const channel = await this.channels.findOne({ where: { code: dto.channelCode } });
    if (!channel) throw new BadRequestException('渠道不存在');
    const rt = await this.roomTypes.findOne({ where: { id: dto.roomTypeId } });
    if (!rt) throw new BadRequestException('房型不存在');
    if ((dto.pets || 0) > 0 && !rt.allowPets) {
      throw new BadRequestException(`房型「${rt.name}」不允许携带宠物`);
    }

    // 统一房态：按可售房量与已订量校验（所有渠道共用同一库存池）
    const dates = nightsBetween(dto.arrivalDate, dto.departureDate);
    const occ = await this.availability(rt.id, dto.arrivalDate, dto.departureDate);
    const soldOutDays = occ.filter((d) => d.remaining <= 0).map((d) => d.date);
    const room = await this.pickRoom(rt.id, dto.arrivalDate, dto.departureDate, dto.roomId);

    let oversold = false;
    if (soldOutDays.length > 0 || !room) {
      if (!dto.forceOversell) {
        throw new BadRequestException(
          `以下日期已无可售房：${soldOutDays.join(', ') || '整段住期'}（如确需超售登记请勾选强制超卖）`,
        );
      }
      oversold = true;
    }

    const booking = this.bookings.create({
      code: genCode('BK'),
      channel, roomType: rt, room: room || null,
      guestName: dto.guestName, guestPhone: dto.guestPhone || null,
      arrivalDate: dto.arrivalDate, departureDate: dto.departureDate, nights: dates.length,
      adults: dto.adults ?? 1, children: dto.children ?? 0, extraBeds: dto.extraBeds ?? 0,
      pets: dto.pets ?? 0, breakfastPortions: dto.breakfastPortions ?? 0,
      dietaryRestrictions: dto.dietaryRestrictions || null,
      depositAmount: dto.depositAmount ?? 0, invoiceRequired: !!dto.invoiceRequired,
      invoiceTitle: dto.invoiceTitle || null, forceOversold: oversold,
    });
    await this.recalc(booking);
    const saved = await this.bookings.save(booking);

    // 自动生成住宿链路：离店日保洁 + 布草申领 + 每日早餐
    await this.provisionChain(saved);

    // 超卖登记 → 自动挂渠道超卖异常
    if (oversold) {
      await this.incidents.save(this.incidents.create({
        code: genCode('INC'), type: 'oversell', severity: 'high',
        bookingId: saved.id, roomId: saved.room?.id || null,
        title: `${channel.name}渠道超卖：订单 ${saved.code} 暂无可用房间`,
        description: `住期 ${saved.arrivalDate} ~ ${saved.departureDate}，库存不足仍强制登记，等待换房/升级处理`,
        status: 'open', meta: { soldOutDays, channelCode: channel.code },
      }));
    }
    return this.detail(saved.id);
  }

  /** 建单后生成保洁、布草申领、早餐订单 */
  async provisionChain(b: Booking) {
    const existClean = await this.cleaning.find({ where: { booking: { id: b.id } } });
    if (existClean.length === 0) {
      const task = await this.cleaning.save(this.cleaning.create({
        booking: b, room: b.room, scheduledDate: b.departureDate, slot: 'morning',
        dirtLevel: 'normal', status: 'pending',
      }));
      await this.linenReqs.save(this.linenReqs.create({ cleaningTask: task, packsNeeded: 1, status: 'requested' }));
    }
    const existBf = await this.breakfasts.find({ where: { bookingId: b.id } });
    if (existBf.length === 0 && b.breakfastPortions > 0) {
      for (const d of breakfastDates(b.arrivalDate, b.departureDate)) {
        await this.breakfasts.save(this.breakfasts.create({
          bookingId: b.id, booking: b, date: d, portions: b.breakfastPortions,
          dietaryRestrictions: b.dietaryRestrictions, status: 'planned',
        }));
      }
    }
  }

  // ---------------- 改单/入住/离店 ----------------

  async update(id: number, patch: Partial<Booking>) {
    const b = await this.bookings.findOne({ where: { id } });
    if (!b) throw new NotFoundException('订单不存在');
    const fields = ['adults', 'children', 'extraGuests', 'extraBeds', 'pets', 'breakfastPortions', 'dietaryRestrictions', 'depositAmount', 'invoiceRequired', 'invoiceTitle'];
    for (const f of fields) if (patch[f] !== undefined) (b as any)[f] = patch[f];
    await this.recalc(b);
    await this.bookings.save(b);
    // 早餐份数/忌口变化 → 同步厨房早餐单（按入住次日…离店日）
    if (patch.breakfastPortions !== undefined || patch.dietaryRestrictions !== undefined) {
      const dates = breakfastDates(b.arrivalDate, b.departureDate);
      const existing = await this.breakfasts.find({ where: { bookingId: b.id } });
      const map = new Map(existing.map((o) => [o.date, o]));
      for (const date of dates) {
        if (b.breakfastPortions <= 0) { map.get(date) && await this.breakfasts.remove(map.get(date)!); continue; }
        let o = map.get(date);
        if (!o) {
          o = this.breakfasts.create({ bookingId: b.id, booking: b, date, portions: b.breakfastPortions });
        }
        o.portions = b.breakfastPortions;
        o.dietaryRestrictions = b.dietaryRestrictions;
        await this.breakfasts.save(o);
      }
    }
    return this.detail(id);
  }

  async assignRoom(id: number, roomId: number) {
    const b = await this.bookings.findOne({ where: { id } });
    if (!b) throw new NotFoundException('订单不存在');
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room || room.roomType.id !== b.roomType.id) throw new BadRequestException('房间不属于该房型');
    const clash = await this.bookings.createQueryBuilder('bk')
      .where('bk.room_id = :rid AND bk.id <> :id', { rid: roomId, id })
      .andWhere('bk.status IN (:...ss)', { ss: ['reserved', 'checked_in'] })
      .andWhere('bk.arrival_date < :dep AND bk.departure_date > :arr', { dep: b.departureDate, arr: b.arrivalDate })
      .getCount();
    if (clash > 0) throw new BadRequestException('该房间在住期内已有订单占用');
    b.room = room;
    await this.bookings.save(b);
    for (const t of await this.cleaning.find({ where: { booking: { id } } })) {
      t.room = room;
      await this.cleaning.save(t);
    }
    return this.detail(id);
  }

  async checkIn(id: number) {
    const b = await this.bookings.findOne({ where: { id } });
    if (!b) throw new NotFoundException('订单不存在');
    if (b.status !== 'reserved') throw new BadRequestException('当前状态不能办理入住');
    if (!b.room) throw new BadRequestException('尚未分配房间（超卖订单请先换房安置）');
    b.status = 'checked_in';
    await this.bookings.save(b);
    return this.detail(id);
  }

  async checkOut(id: number) {
    const b = await this.bookings.findOne({ where: { id } });
    if (!b) throw new NotFoundException('订单不存在');
    if (b.status !== 'checked_in') throw new BadRequestException('当前状态不能办理离店');
    b.status = 'checked_out';
    await this.bookings.save(b);
    return this.detail(id);
  }

  async cancel(id: number) {
    const b = await this.bookings.findOne({ where: { id } });
    if (!b) throw new NotFoundException('订单不存在');
    if (b.status === 'checked_out') throw new BadRequestException('已离店订单不能取消');
    b.status = 'cancelled';
    b.room = null;
    await this.bookings.save(b);
    return this.detail(id);
  }
}
