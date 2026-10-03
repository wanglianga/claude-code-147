import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BreakfastOrder, Incident } from '../entities';
import { genCode } from '../common';

@Injectable()
export class KitchenService {
  constructor(
    @InjectRepository(BreakfastOrder) private breakfasts: Repository<BreakfastOrder>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
  ) {}

  /** 厨房看板：按供应日汇总份数/忌口，列出每张早餐单 */
  async board(from: string, to: string) {
    const qb = this.breakfasts.createQueryBuilder('bo')
      .leftJoinAndSelect('bo.booking', 'b')
      .leftJoinAndSelect('b.room', 'r')
      .orderBy('bo.date', 'ASC');
    if (from) qb.andWhere('bo.date >= :from', { from });
    if (to) qb.andWhere('bo.date <= :to', { to });
    const orders = await qb.getMany();
    const daysMap = new Map<string, any>();
    for (const o of orders) {
      if (!daysMap.has(o.date)) {
        daysMap.set(o.date, {
          date: o.date, totalPortions: 0, prepared: 0, served: 0, shortage: 0,
          dietary: [] as string[], orders: [] as any[],
        });
      }
      const day = daysMap.get(o.date);
      day.totalPortions += o.portions;
      if (o.status === 'prepared') day.prepared += o.portions;
      if (o.status === 'served') day.served += o.portions;
      if (o.status === 'shortage') day.shortage += o.portions;
      if (o.dietaryRestrictions) day.dietary.push(`${o.booking.code} ${o.booking.guestName}：${o.dietaryRestrictions}`);
      day.orders.push(o);
    }
    return { days: [...daysMap.values()] };
  }

  async patchOrder(id: number, dto: { status?: string; note?: string; portions?: number }) {
    const order = await this.breakfasts.findOne({ where: { id }, relations: { booking: true } });
    if (!order) throw new NotFoundException('早餐单不存在');
    if (dto.portions != null) order.portions = dto.portions;
    if (dto.note !== undefined) order.note = dto.note;
    if (dto.status) {
      if (!['planned', 'prepared', 'served', 'shortage'].includes(dto.status)) {
        throw new BadRequestException('状态不合法');
      }
      order.status = dto.status;
      // 供应不足 → 自动挂早餐异常，进入补偿链路
      if (dto.status === 'shortage') {
        const exists = await this.incidents.findOne({
          where: { type: 'breakfast_shortage', bookingId: order.booking.id, status: 'open' },
        });
        if (!exists) {
          await this.incidents.save(this.incidents.create({
            code: genCode('INC'), type: 'breakfast_shortage', severity: 'mid',
            bookingId: order.booking.id, roomId: order.booking.room?.id || null,
            title: `${order.date} 早餐供应不足：订单 ${order.booking.code}`,
            description: dto.note || `计划 ${order.portions} 份未能足额供应`,
            status: 'open', meta: { date: order.date, portions: order.portions },
          }));
        }
      }
    }
    return this.breakfasts.save(order);
  }
}
