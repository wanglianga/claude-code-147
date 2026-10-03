import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, CleaningTask, Incident, LinenRequest, LinenStock, Room } from '../entities';
import { genCode, num } from '../common';

@Injectable()
export class HousekeepingService {
  constructor(
    @InjectRepository(CleaningTask) private tasks: Repository<CleaningTask>,
    @InjectRepository(LinenRequest) private linenReqs: Repository<LinenRequest>,
    @InjectRepository(LinenStock) private stock: Repository<LinenStock>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
  ) {}

  private async stockRow(): Promise<LinenStock> {
    let row = (await this.stock.find())[0];
    if (!row) row = await this.stock.save(this.stock.create({ packsTotal: 0, packsAvailable: 0, packsInWash: 0 }));
    return row;
  }

  async list(date?: string, status?: string) {
    const qb = this.tasks.createQueryBuilder('t')
      .leftJoinAndSelect('t.booking', 'b')
      .leftJoinAndSelect('t.room', 'r')
      .leftJoinAndSelect('r.roomType', 'rt')
      .orderBy('t.scheduled_date', 'ASC')
      .addOrderBy('t.slot', 'ASC');
    if (date) qb.andWhere('t.scheduled_date = :date', { date });
    if (status) qb.andWhere('t.status = :status', { status });
    const tasks = await qb.getMany();
    const reqs = await this.linenReqs.find({
      where: { cleaningTask: { id: In(tasks.map((t) => t.id)) } },
    });
    const reqMap = new Map<number, LinenRequest[]>();
    for (const r of reqs) reqMap.set(r.cleaningTask.id, [...(reqMap.get(r.cleaningTask.id) || []), r]);
    return tasks.map((t) => ({ ...t, linenRequests: reqMap.get(t.id) || [] }));
  }

  async patch(id: number, dto: any) {
    const task = await this.tasks.findOne({ where: { id }, relations: { booking: true, room: true } });
    if (!task) throw new NotFoundException('保洁任务不存在');
    for (const f of ['assignee', 'dirtLevel', 'slot', 'note', 'scheduledDate']) {
      if (dto[f] !== undefined) (task as any)[f] = dto[f];
    }
    if (dto.status === 'in_progress') {
      if (task.status === 'blocked' && !dto.force) {
        throw new BadRequestException('任务处于阻塞状态，请先解除阻塞原因或强制开始');
      }
      task.status = 'in_progress';
      task.blockedReason = null;
      if (!task.startTime) task.startTime = new Date();
    } else if (dto.status === 'blocked') {
      task.status = 'blocked';
      task.blockedReason = dto.blockedReason || task.blockedReason || 'other';
      task.note = dto.note ?? task.note;
    } else if (dto.status === 'done') {
      task.status = 'done';
      task.endTime = new Date();
      task.blockedReason = null;
      // 布草随打扫完成转入洗涤中
      const reqs = await this.linenReqs.find({ where: { cleaningTask: { id } } });
      const stock = await this.stockRow();
      for (const r of reqs) {
        if (r.status === 'delivered') {
          r.status = 'returned';
          r.returnedAt = new Date();
          stock.packsInWash += r.packsNeeded;
          await this.linenReqs.save(r);
        }
      }
      await this.stock.save(stock);
    } else if (dto.status === 'pending') {
      task.status = 'pending';
      task.blockedReason = null;
    }
    return this.tasks.save(task);
  }

  /** 布草送达：扣减可用库存，解除保洁的布草阻塞 */
  async deliverLinen(requestId: number) {
    const req = await this.linenReqs.findOne({ where: { id: requestId }, relations: { cleaningTask: true } });
    if (!req) throw new NotFoundException('布草申领不存在');
    if (req.status !== 'requested') throw new BadRequestException('该申领已处理');
    const stock = await this.stockRow();
    if (stock.packsAvailable < req.packsNeeded) {
      throw new BadRequestException(`干净布草库存不足：需 ${req.packsNeeded} 套，可用 ${stock.packsAvailable} 套`);
    }
    stock.packsAvailable -= req.packsNeeded;
    await this.stock.save(stock);
    req.status = 'delivered';
    req.deliveredAt = new Date();
    await this.linenReqs.save(req);

    const task = req.cleaningTask;
    if (task && task.status === 'blocked' && task.blockedReason === 'linen_shortage') {
      task.status = 'pending';
      task.blockedReason = null;
      await this.tasks.save(task);
    }
    // 关联的布草延迟异常自动关闭
    if (task?.booking) {
      const open = await this.incidents.find({
        where: { type: 'linen_delay', bookingId: task.booking.id, status: In(['open', 'processing']) },
      });
      for (const inc of open) {
        inc.status = 'closed';
        inc.resolvedAt = new Date();
        inc.description = (inc.description || '') + '（布草已送达，自动关闭）';
        await this.incidents.save(inc);
      }
    }
    return req;
  }

  /** 洗涤完成回库 */
  async washComplete(packs: number) {
    const stock = await this.stockRow();
    if (packs > stock.packsInWash) throw new BadRequestException('回库数量超过洗涤中数量');
    stock.packsInWash -= packs;
    stock.packsAvailable += packs;
    return this.stock.save(stock);
  }

  async stockInfo() {
    return this.stockRow();
  }
}
