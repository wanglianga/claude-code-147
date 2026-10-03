import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, Compensation, Incident, Review } from '../entities';
import { genCode, num, round2 } from '../common';
import { IncidentsService } from './incidents.service';
import { ReviewsService } from './reviews.service';

@Injectable()
export class CompensationsService {
  constructor(
    @InjectRepository(Compensation) private comps: Repository<Compensation>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Review) private reviews: Repository<Review>,
    private incidentSvc: IncidentsService,
    private reviewSvc: ReviewsService,
  ) {}

  async list(bookingId?: number) {
    if (bookingId) return this.comps.find({ where: { bookingId }, order: { issuedAt: 'DESC' } });
    return this.comps.find({ relations: { booking: true }, order: { issuedAt: 'DESC' } });
  }

  /** 根据订单未闭环异常给出补偿建议 */
  async suggestions(bookingId: number) {
    const b = await this.bookings.findOne({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('订单不存在');
    const incs = await this.incidents.find({ where: { bookingId, status: In(['open', 'processing']) } });
    const reviews = await this.reviews.find({ where: { bookingId } });
    const suggestions: { kind: string; amount: number; reason: string; incidentId?: number; reviewId?: number }[] = [];

    for (const inc of incs) {
      switch (inc.type) {
        case 'breakfast_shortage':
          suggestions.push({ kind: 'refund', amount: round2(num(b.roomType.breakfastPrice)), reason: '早餐未足额供应，按单价退还早餐费', incidentId: inc.id });
          break;
        case 'oversell':
          suggestions.push({ kind: 'coupon', amount: 200, reason: '渠道超卖到店无房，发放 200 元补偿券并协助升级', incidentId: inc.id });
          break;
        case 'room_fault':
          suggestions.push({ kind: 'coupon', amount: 100, reason: '房间硬件故障影响入住体验，发放 100 元补偿券', incidentId: inc.id });
          break;
        case 'linen_delay':
          suggestions.push({ kind: 'coupon', amount: 50, reason: '布草送达延迟导致打扫等待，发放 50 元补偿券', incidentId: inc.id });
          break;
        case 'late_checkout':
          suggestions.push({ kind: 'coupon', amount: 80, reason: '上一位客人延迟退房导致等待，发放 80 元补偿券', incidentId: inc.id });
          break;
        case 'pet_damage':
          suggestions.push({
            kind: 'deposit_deduction',
            amount: round2(num(inc.meta?.suggestedDepositDeduction) || num(inc.meta?.repairCost) || 0),
            reason: '宠物损坏家具，从押金扣除维修费用', incidentId: inc.id,
          });
          break;
      }
    }
    for (const r of reviews) {
      if (r.rating <= 3 && r.status !== 'compensated' && !suggestions.some((s) => s.reviewId === r.id)) {
        suggestions.push({
          kind: 'coupon', amount: r.rating <= 2 ? 150 : 80,
          reason: `${r.rating} 星差评（${r.category === 'hardware' ? '硬件' : r.category === 'service' ? '服务' : r.category === 'oversell' ? '超卖' : r.category === 'food_prep' ? '餐食' : '其他'}）安抚补偿券`,
          reviewId: r.id,
        });
      }
    }
    return { bookingCode: b.code, depositAmount: num(b.depositAmount), suggestions };
  }

  async issue(dto: {
    bookingId?: number; incidentId?: number; reviewId?: number;
    kind: string; amount?: number; reason: string; couponCode?: string;
  }) {
    if (!['coupon', 'refund', 'upgrade', 'cash', 'deposit_deduction'].includes(dto.kind)) {
      throw new BadRequestException('补偿类型不合法');
    }
    let booking: Booking | null = null;
    if (dto.bookingId) booking = await this.bookings.findOne({ where: { id: dto.bookingId } });
    if (dto.incidentId) {
      const inc = await this.incidents.findOne({ where: { id: dto.incidentId } });
      if (!inc) throw new NotFoundException('异常事件不存在');
      if (!booking && inc.bookingId) booking = await this.bookings.findOne({ where: { id: inc.bookingId } });
    }
    if (dto.kind === 'deposit_deduction') {
      if (!booking) throw new BadRequestException('押金扣除必须关联订单');
      const already = await this.comps.find({ where: { bookingId: booking.id, kind: 'deposit_deduction' } });
      const used = already.reduce((s, c) => s + num(c.amount), 0);
      if (used + num(dto.amount) > num(booking.depositAmount)) {
        throw new BadRequestException(`押金扣除超额：押金 ${num(booking.depositAmount)}，已扣 ${used}，本次最多可扣 ${round2(num(booking.depositAmount) - used)}`);
      }
    }
    const comp = this.comps.create({
      code: genCode('CMP'),
      bookingId: booking?.id || null,
      booking,
      incidentId: dto.incidentId || null,
      reviewId: dto.reviewId || null,
      kind: dto.kind,
      reason: dto.reason,
      amount: round2(num(dto.amount)),
      couponCode: dto.couponCode || (dto.kind === 'coupon' ? genCode('COUPON').slice(-8) : null),
      status: 'issued',
    });
    const saved = await this.comps.save(comp);

    if (dto.incidentId) await this.incidentSvc.markCompensated(dto.incidentId);
    if (dto.reviewId) {
      const r = await this.reviews.findOne({ where: { id: dto.reviewId } });
      if (r && r.status !== 'compensated') await this.reviewSvc.markCompensated(dto.reviewId);
      const inc = await this.incidents.findOne({ where: { type: 'bad_review', bookingId: booking?.id } });
      if (inc) await this.incidentSvc.markCompensated(inc.id);
    }
    return saved;
  }

  async revoke(id: number) {
    const c = await this.comps.findOne({ where: { id } });
    if (!c) throw new NotFoundException('补偿记录不存在');
    c.status = 'revoked';
    return this.comps.save(c);
  }
}
