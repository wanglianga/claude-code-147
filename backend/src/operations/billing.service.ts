import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingRecord, Booking, Compensation, MaintenanceTicket } from '../entities';
import { num, round2 } from '../common';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingRecord) private bills: Repository<BillingRecord>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Compensation) private comps: Repository<Compensation>,
    @InjectRepository(MaintenanceTicket) private maintenance: Repository<MaintenanceTicket>,
  ) {}

  async settle(bookingId: number) {
    const b = await this.bookings.findOne({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('订单不存在');
    const exist = await this.bills.findOne({ where: { bookingId } });
    if (exist) throw new BadRequestException('该订单已结算，如需变更请撤销原结算单');

    const comps = await this.comps.find({ where: { bookingId, status: 'issued' } });
    const sumKind = (kind: string) => round2(comps.filter((c) => c.kind === kind).reduce((s, c) => s + num(c.amount), 0));
    const depositDeduction = sumKind('deposit_deduction');
    const refundCost = sumKind('refund');
    const couponCost = sumKind('coupon');
    const cashCost = sumKind('cash');
    const upgradeCost = comps.filter((c) => c.kind === 'upgrade').reduce((s, c) => s + num(c.amount), 0);

    const tickets = await this.maintenance.find({ where: { booking: { id: b.id } } });
    const repairCost = round2(tickets.reduce((s, t) => s + num(t.repairCost), 0));

    const roomFee = num(b.roomFee), extraBedFee = num(b.extraBedFee);
    const breakfastFee = num(b.breakfastFee), addOnFee = num(b.addOnFee);
    const commission = num(b.commissionAmount);
    const depositCollected = num(b.depositAmount);

    const grossRevenue = round2(roomFee + extraBedFee + breakfastFee + addOnFee);
    // 净收入 = 营收 - 渠道佣金 - 退款 - 现金赔付/升级 - 补偿券成本
    const netIncome = round2(grossRevenue - commission - refundCost - cashCost - upgradeCost - couponCost);
    const totalReceivable = round2(grossRevenue + depositCollected - depositDeduction - refundCost - cashCost);

    const bill = this.bills.create({
      bookingId, booking: b,
      roomFee, extraBedFee, breakfastFee, addOnFee,
      commissionAmount: commission,
      depositCollected, depositDeduction,
      refundCost, couponCost,
      cashCost: round2(cashCost + upgradeCost),
      totalReceivable, netIncome,
      breakdown: {
        grossRevenue,
        compensationVouchers: comps.map((c) => ({ code: c.code, kind: c.kind, amount: num(c.amount), reason: c.reason })),
        repairCost,
        nightlyRates: b.dailyRates,
        commissionRate: num(b.commissionRate),
      },
    });
    return this.bills.save(bill);
  }

  async revoke(bookingId: number) {
    const bill = await this.bills.findOne({ where: { bookingId } });
    if (!bill) throw new NotFoundException('结算单不存在');
    await this.bills.remove(bill);
    return { revoked: true, bookingId };
  }

  async list(filter: { from?: string; to?: string; channelCode?: string }) {
    const qb = this.bills.createQueryBuilder('br')
      .leftJoinAndSelect('br.booking', 'b')
      .leftJoinAndSelect('b.channel', 'c')
      .leftJoinAndSelect('b.roomType', 'rt')
      .orderBy('br.settled_at', 'DESC');
    if (filter.from) qb.andWhere('b.departure_date >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('b.departure_date <= :to', { to: filter.to });
    if (filter.channelCode) qb.andWhere('c.code = :cc', { cc: filter.channelCode });
    return qb.getMany();
  }
}
