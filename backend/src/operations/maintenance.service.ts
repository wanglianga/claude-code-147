import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Incident, MaintenanceTicket, Room } from '../entities';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceTicket) private tickets: Repository<MaintenanceTicket>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
  ) {}

  list(status?: string) {
    const qb = this.tickets.createQueryBuilder('m')
      .leftJoinAndSelect('m.room', 'r')
      .leftJoinAndSelect('r.roomType', 'rt')
      .leftJoinAndSelect('m.booking', 'b')
      .orderBy('m.reported_at', 'DESC');
    if (status) qb.andWhere('m.status = :status', { status });
    return qb.getMany();
  }

  async create(dto: any) {
    const room = await this.rooms.findOne({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('房间不存在');
    const ticket = this.tickets.create({
      room,
      booking: dto.bookingId ? ({ id: dto.bookingId } as any) : null,
      category: dto.category || 'other',
      title: dto.title,
      description: dto.description || null,
      blocksRoom: dto.blocksRoom !== false,
      blockDateFrom: dto.dateFrom || null,
      blockDateTo: dto.dateTo || null,
      repairCost: dto.repairCost || 0,
      status: 'open',
    });
    const saved = await this.tickets.save(ticket);
    // 房间故障自动入事件链
    if (saved.blocksRoom) {
      await this.incidents.save(this.incidents.create({
        code: `INC${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
        type: 'room_fault', severity: 'high',
        bookingId: dto.bookingId || null, roomId: room.id,
        title: `房间 ${room.number} ${saved.title}`,
        description: saved.description || '房间硬件故障，已暂停该房售卖',
        status: 'open', meta: { ticketId: saved.id, category: saved.category },
      }));
    }
    return saved;
  }

  async patch(id: number, dto: any) {
    const t = await this.tickets.findOne({ where: { id }, relations: { room: true } });
    if (!t) throw new NotFoundException('维修单不存在');
    if (dto.status) {
      if (!['open', 'repairing', 'resolved'].includes(dto.status)) throw new BadRequestException('状态不合法');
      t.status = dto.status;
      if (dto.status === 'resolved') t.resolvedAt = new Date();
    }
    for (const f of ['repairCost', 'note', 'title', 'description', 'blockDateFrom', 'blockDateTo']) {
      if (dto[f] !== undefined) (t as any)[f] = dto[f];
    }
    const saved = await this.tickets.save(t);
    // 维修完成 → 自动关闭对应的硬件故障事件
    if (dto.status === 'resolved') {
      const open = await this.incidents.find({
        where: { type: 'room_fault', roomId: t.room.id, status: In(['open', 'processing']) },
      });
      for (const inc of open) {
        inc.status = 'closed';
        inc.resolvedAt = new Date();
        inc.description = (inc.description || '') + '（维修已完成，自动关闭）';
        await this.incidents.save(inc);
      }
    }
    return saved;
  }
}
