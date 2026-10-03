import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, CleaningTask, Incident, MaintenanceTicket } from '../entities';
import { genCode, num } from '../common';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(CleaningTask) private cleaning: Repository<CleaningTask>,
    @InjectRepository(MaintenanceTicket) private maintenance: Repository<MaintenanceTicket>,
    private bookingSvc: BookingsService,
  ) {}

  async list(filter: { type?: string; status?: string; bookingId?: number }) {
    const qb = this.incidents.createQueryBuilder('i').orderBy('i.occurred_at', 'DESC');
    if (filter.type) qb.andWhere('i.type = :type', { type: filter.type });
    if (filter.status) qb.andWhere('i.status = :status', { status: filter.status });
    if (filter.bookingId) qb.andWhere('i.booking_id = :bid', { bid: filter.bookingId });
    return qb.getMany();
  }

  async create(dto: {
    type: string; bookingId?: number; roomId?: number; title: string;
    description?: string; severity?: string; meta?: any;
  }) {
    const allowed = ['late_checkout', 'room_fault', 'linen_delay', 'extra_guest', 'pet_damage', 'breakfast_shortage', 'oversell', 'bad_review'];
    if (!allowed.includes(dto.type)) throw new BadRequestException('事件类型不合法');
    let booking: Booking | null = null;
    if (dto.bookingId) booking = await this.bookings.findOne({ where: { id: dto.bookingId } });

    const inc = this.incidents.create({
      code: genCode('INC'),
      type: dto.type,
      severity: dto.severity || (dto.type === 'room_fault' || dto.type === 'oversell' || dto.type === 'pet_damage' ? 'high' : 'mid'),
      bookingId: dto.bookingId || null,
      roomId: dto.roomId || booking?.room?.id || null,
      title: dto.title,
      description: dto.description || null,
      status: 'open',
      meta: dto.meta || null,
    });
    const saved = await this.incidents.save(inc);

    // 事件 → 链路联动
    switch (dto.type) {
      case 'late_checkout':
        await this.blockCleaning(booking, 'delayed_checkout', '上一位客人延迟退房，打扫顺延');
        break;
      case 'linen_delay':
        await this.blockCleaning(booking, 'linen_shortage', '布草未及时送达，等待布草');
        break;
      case 'extra_guest':
        if (booking) {
          const count = num(dto.meta?.count) || 1;
          booking.extraGuests += count;
          await this.bookingSvc.recalc(booking);
          await this.bookings.save(booking);
          saved.meta = { ...(saved.meta || {}), extraGuestsAfter: booking.extraGuests, addedFee: booking.addOnFee };
          await this.incidents.save(saved);
        }
        break;
      case 'pet_damage': {
        if (booking?.room) {
          const ticket = await this.maintenance.save(this.maintenance.create({
            room: booking.room, booking,
            category: 'furniture',
            title: `宠物损坏家具（订单 ${booking.code}）`,
            description: dto.description || '住客宠物造成家具损坏',
            blocksRoom: false,
            repairCost: num(dto.meta?.repairCost) || 0,
            status: 'open',
          }));
          saved.meta = { ...(saved.meta || {}), maintenanceTicketId: ticket.id, suggestedDepositDeduction: num(dto.meta?.repairCost) || 0 };
          await this.incidents.save(saved);
        }
        break;
      }
    }
    return saved;
  }

  private async blockCleaning(booking: Booking | null, reason: string, note: string) {
    if (!booking) return;
    const tasks = await this.cleaning.find({ where: { booking: { id: booking.id } } });
    for (const t of tasks) {
      if (t.status !== 'done') {
        t.status = 'blocked';
        t.blockedReason = reason;
        t.note = t.note ? t.note : note;
        await this.cleaning.save(t);
      }
    }
  }

  async process(id: number, note?: string) {
    const inc = await this.incidents.findOne({ where: { id } });
    if (!inc) throw new NotFoundException('事件不存在');
    if (inc.status === 'closed' || inc.status === 'compensated') throw new BadRequestException('事件已结束');
    inc.status = 'processing';
    if (note) inc.description = (inc.description ? inc.description + '\n' : '') + `处理记录：${note}`;
    return this.incidents.save(inc);
  }

  /** 解决事件：late_checkout/linen_delay 自动解除保洁阻塞 */
  async resolve(id: number, note?: string) {
    const inc = await this.incidents.findOne({ where: { id } });
    if (!inc) throw new NotFoundException('事件不存在');
    inc.status = 'closed';
    inc.resolvedAt = new Date();
    if (note) inc.description = (inc.description ? inc.description + '\n' : '') + `解决记录：${note}`;
    await this.incidents.save(inc);

    if (inc.bookingId && (inc.type === 'late_checkout' || inc.type === 'linen_delay')) {
      const stillBlocking = await this.incidents.find({
        where: { bookingId: inc.bookingId, type: In(['late_checkout', 'linen_delay']), status: In(['open', 'processing']) },
      });
      if (stillBlocking.length === 0) {
        const tasks = await this.cleaning.find({ where: { booking: { id: inc.bookingId } } });
        for (const t of tasks) {
          if (t.status === 'blocked' && (t.blockedReason === 'delayed_checkout' || t.blockedReason === 'linen_shortage')) {
            t.status = 'pending';
            t.blockedReason = null;
            await this.cleaning.save(t);
          }
        }
      }
    }
    return inc;
  }

  /** 事件已补偿（由补偿模块回写） */
  async markCompensated(id: number) {
    const inc = await this.incidents.findOne({ where: { id } });
    if (inc && inc.status !== 'closed') {
      inc.status = 'compensated';
      inc.resolvedAt = new Date();
      await this.incidents.save(inc);
    }
  }
}
