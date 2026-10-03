import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Channel, RoomType, Room, PriceCalendar, InventoryDay, Setting, LinenStock } from '../entities';
import { num, round2 } from '../common';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Channel) private channels: Repository<Channel>,
    @InjectRepository(RoomType) private roomTypes: Repository<RoomType>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(PriceCalendar) private priceCal: Repository<PriceCalendar>,
    @InjectRepository(InventoryDay) private invDays: Repository<InventoryDay>,
    @InjectRepository(Setting) private settings: Repository<Setting>,
    @InjectRepository(LinenStock) private linen: Repository<LinenStock>,
  ) {}

  overview() {
    return Promise.all([
      this.channels.find({ order: { id: 'ASC' } }),
      this.roomTypes.find({ order: { id: 'ASC' } }),
      this.rooms.find({ order: { number: 'ASC' } }),
      this.linen.find(),
    ]).then(([channelList, typeList, roomList, linenList]) => ({
      channels: channelList,
      roomTypes: typeList,
      rooms: roomList,
      linen: linenList[0] || null,
    }));
  }

  async setLinen(input: { packsTotal?: number; packsAvailable?: number; packsInWash?: number }) {
    let row = (await this.linen.find())[0];
    if (!row) {
      row = this.linen.create({ packsTotal: 0, packsAvailable: 0, packsInWash: 0 });
    }
    if (input.packsTotal != null) row.packsTotal = input.packsTotal;
    if (input.packsAvailable != null) row.packsAvailable = input.packsAvailable;
    if (input.packsInWash != null) row.packsInWash = input.packsInWash;
    return this.linen.save(row);
  }

  async savePriceCalendar(items: { roomTypeId: number; date: string; price: number }[]) {
    for (const it of items) {
      let row = await this.priceCal.findOne({ where: { roomTypeId: it.roomTypeId, date: it.date } });
      if (!row) row = this.priceCal.create({ roomTypeId: it.roomTypeId, date: it.date });
      row.price = round2(num(it.price));
      await this.priceCal.save(row);
    }
    return { saved: items.length };
  }

  /** 某天某房型日历价（无覆盖取基础价） */
  async priceOf(roomTypeId: number, date: string, basePrice = 0): Promise<number> {
    const row = await this.priceCal.findOne({ where: { roomTypeId, date } });
    return row ? num(row.price) : basePrice;
  }

  /** 某天某房型实际房间数与可售房量 */
  async sellableOf(roomTypeId: number, date: string): Promise<{ physical: number; sellable: number; row: InventoryDay | null }> {
    const physical = await this.rooms.count({ where: { roomType: { id: roomTypeId } } });
    const row = await this.invDays.findOne({ where: { roomTypeId, date } });
    const sellable = row ? Math.min(row.sellableRooms, physical) : physical;
    return { physical, sellable: Math.max(0, sellable), row };
  }

  async setInventory(items: { roomTypeId: number; date: string; sellableRooms: number; note?: string }[]) {
    for (const it of items) {
      let row = await this.invDays.findOne({ where: { roomTypeId: it.roomTypeId, date: it.date } });
      if (!row) row = this.invDays.create({ roomTypeId: it.roomTypeId, date: it.date });
      row.sellableRooms = it.sellableRooms;
      row.note = it.note ?? null;
      await this.invDays.save(row);
    }
    return { saved: items.length };
  }

  async inventoryRange(from: string, to: string) {
    const [types, rooms, rows] = await Promise.all([
      this.roomTypes.find({ order: { id: 'ASC' } }),
      this.rooms.find(),
      this.invDays.find({ where: { date: Between(from, to) }, order: { date: 'ASC' } }),
    ]);
    const counts: Record<number, number> = {};
    for (const r of rooms) counts[r.roomType.id] = (counts[r.roomType.id] || 0) + 1;
    return {
      roomTypes: types.map((t) => ({
        roomTypeId: t.id, name: t.name, physicalRooms: counts[t.id] || 0,
      })),
      overrides: rows,
    };
  }

  async getSetting(key: string, fallback: any = null) {
    const row = await this.settings.findOne({ where: { key } });
    return row ? row.value : fallback;
  }

  async setSetting(key: string, value: any) {
    let row = await this.settings.findOne({ where: { key } });
    if (!row) row = this.settings.create({ key });
    row.value = value;
    return this.settings.save(row);
  }

  async requireRoom(id: number): Promise<Room> {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    return room;
  }
}
