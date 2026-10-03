import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  User, Channel, RoomType, Room, PriceCalendar, LinenStock, InventoryDay,
} from './entities';
import { CHANNELS, dateStr, nightsBetween, num, round2 } from './common';
import { BookingsService } from './bookings/bookings.service';
import { IncidentsService } from './operations/incidents.service';
import { ReviewsService } from './operations/reviews.service';
import { CompensationsService } from './operations/compensations.service';
import { BillingService } from './operations/billing.service';
import { MaintenanceService } from './operations/maintenance.service';
import { HousekeepingService } from './operations/housekeeping.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Seed');

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Channel) private channels: Repository<Channel>,
    @InjectRepository(RoomType) private roomTypes: Repository<RoomType>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(PriceCalendar) private priceCal: Repository<PriceCalendar>,
    @InjectRepository(LinenStock) private linen: Repository<LinenStock>,
    private ds: DataSource,
    private bookings: BookingsService,
    private incidents: IncidentsService,
    private reviews: ReviewsService,
    private comps: CompensationsService,
    private billing: BillingService,
    private maintenance: MaintenanceService,
    private hk: HousekeepingService,
  ) {}

  async onApplicationBootstrap() {
    const userCount = await this.users.count();
    if (userCount > 0) {
      this.logger.log('数据已存在，跳过种子');
      return;
    }
    this.logger.log('开始写入旺季演示数据...');

    // 用户
    const hash = await bcrypt.hash('owner123', 10);
    await this.users.save([
      this.users.create({ username: 'owner', passwordHash: hash, name: '店主老周', role: 'owner' }),
      this.users.create({ username: 'housekeeper', passwordHash: await bcrypt.hash('house123', 10), name: '管家阿敏', role: 'housekeeper' }),
      this.users.create({ username: 'kitchen', passwordHash: await bcrypt.hash('kitchen123', 10), name: '厨房秀兰', role: 'kitchen' }),
    ]);

    // 渠道
    const channelRows = await this.channels.save(CHANNELS.map((c) => this.channels.create(c)));
    const ch = (code: string) => channelRows.find((c) => c.code === code)!;

    // 房型 & 房间
    const t1 = await this.roomTypes.save(this.roomTypes.create({
      name: '山景大床房', basePrice: 480, maxOccupancy: 2, allowPets: false,
      extraBedPrice: 120, breakfastPrice: 68,
    }));
    const t2 = await this.roomTypes.save(this.roomTypes.create({
      name: '亲子家庭房', basePrice: 780, maxOccupancy: 4, allowPets: false,
      extraBedPrice: 120, breakfastPrice: 58,
    }));
    const t3 = await this.roomTypes.save(this.roomTypes.create({
      name: '庭院宠物房', basePrice: 680, maxOccupancy: 3, allowPets: true, petFee: 80,
      extraBedPrice: 100, breakfastPrice: 58,
    }));
    const roomDefs: [string, number, RoomType][] = [
      ['A101', 1, t1], ['A102', 1, t1], ['A103', 1, t1],
      ['B201', 2, t2], ['B202', 2, t2],
      ['C301', 3, t3], ['C302', 3, t3],
    ];
    const roomRows = [];
    for (const [number, floor, rt] of roomDefs) {
      roomRows.push(await this.rooms.save(this.rooms.create({ number, floor, roomType: rt })));
    }
    const R = (n: string) => roomRows.find((r) => r.number === n)!;

    // 旺季日历价（T-5 ~ T+14）
    const today = new Date();
    const mk = (offset: number) => {
      const d = new Date(today); d.setDate(d.getDate() + offset); return dateStr(d);
    };
    const peakPrice: Record<number, number> = { [t1.id]: 980, [t2.id]: 1380, [t3.id]: 1180 };
    for (let off = -5; off <= 14; off++) {
      for (const rt of [t1, t2, t3]) {
        // 节假日头三天再上浮
        const uplift = off >= 0 && off <= 2 ? 100 : 0;
        await this.priceCal.save(this.priceCal.create({
          roomTypeId: rt.id, date: mk(off), price: peakPrice[rt.id] + uplift,
        }));
      }
    }

    // 布草库存
    await this.linen.save(this.linen.create({ packsTotal: 12, packsAvailable: 8, packsInWash: 4 }));

    // ---- 历史订单（已离店、已结算）----
    // B001 携程山景：空调故障 → 2 星硬件差评 → 100 元券
    const b001 = (await this.bookings.create({
      channelCode: 'ctrip', roomTypeId: t1.id, roomId: R('A101').id,
      guestName: '王磊', guestPhone: '13800001111',
      arrivalDate: mk(-3), departureDate: mk(-1),
      adults: 2, breakfastPortions: 2, depositAmount: 300,
    })).booking;
    await this.bookings.checkIn(b001.id);
    const tFault = await this.maintenance.create({
      roomId: R('A101').id, bookingId: b001.id, category: 'ac',
      title: '空调不制冷', description: '客人反映夜间空调不制冷',
      blocksRoom: true, dateFrom: mk(-3), dateTo: mk(-2), repairCost: 260,
    });
    await this.maintenance.patch(tFault.id, { status: 'resolved' });
    await this.bookings.checkOut(b001.id);
    const rv1 = await this.reviews.create({
      bookingId: b001.id, rating: 2,
      content: '空调半夜坏了热得睡不着，硬件太老旧，希望改进。', category: 'hardware',
    });
    await this.comps.issue({ bookingId: b001.id, reviewId: rv1.id, kind: 'coupon', amount: 100, reason: '空调故障导致入住体验差，发放 100 元补偿券' });
    await this.billing.settle(b001.id);

    // B002 美团亲子：延迟退房 → 保洁顺延（已闭环）
    const b002 = (await this.bookings.create({
      channelCode: 'meituan', roomTypeId: t2.id, roomId: R('B201').id,
      guestName: '李娜一家', guestPhone: '13800002222',
      arrivalDate: mk(-2), departureDate: mk(0),
      adults: 2, children: 1, extraBeds: 1, breakfastPortions: 3, depositAmount: 500,
      invoiceRequired: true, invoiceTitle: '杭州某某科技有限公司',
    })).booking;
    await this.bookings.checkIn(b002.id);
    const incLate = await this.incidents.create({
      type: 'late_checkout', bookingId: b002.id, title: '上一位客人延迟退房',
      description: '客人午餐后才退房，下一波打扫顺延',
    });
    await this.incidents.resolve(incLate.id, '已为下批客人调整入住时间');
    await this.bookings.checkOut(b002.id);
    await this.reviews.create({ bookingId: b002.id, rating: 5, content: '院子很舒服，管家响应及时，下次还来。', category: 'service' });
    await this.billing.settle(b002.id);

    // B003 官网宠物房：宠物损坏沙发 → 押金扣除 150
    const b003 = (await this.bookings.create({
      channelCode: 'direct', roomTypeId: t3.id, roomId: R('C301').id,
      guestName: '陈默与狗', guestPhone: '13800003333',
      arrivalDate: mk(-2), departureDate: mk(-1),
      adults: 2, pets: 1, breakfastPortions: 2, depositAmount: 500,
    })).booking;
    await this.bookings.checkIn(b003.id);
    await this.incidents.create({
      type: 'pet_damage', bookingId: b003.id, title: '宠物抓坏布艺沙发',
      description: '沙发扶手抓痕明显，需要换布维修', meta: { repairCost: 150 },
    });
    await this.bookings.checkOut(b003.id);
    await this.comps.issue({ bookingId: b003.id, kind: 'deposit_deduction', amount: 150, reason: '宠物抓坏沙发，押金扣除维修费 150 元' });
    await this.reviews.create({ bookingId: b003.id, rating: 4, content: '院子对狗很友好，赔沙发也认，提醒大家看宠。', category: 'other' });
    await this.billing.settle(b003.id);

    // B004 小程序山景：布草延迟 + 早餐不足（今日离店，问题尚未闭环）
    const b004 = (await this.bookings.create({
      channelCode: 'miniapp', roomTypeId: t1.id, roomId: R('A102').id,
      guestName: '赵晓', guestPhone: '13800004444',
      arrivalDate: mk(-1), departureDate: mk(0),
      adults: 2, breakfastPortions: 2, dietaryRestrictions: '不吃香菜', depositAmount: 300,
    })).booking;
    await this.bookings.checkIn(b004.id);
    await this.incidents.create({
      type: 'linen_delay', bookingId: b004.id, title: '布草未及时送达',
      description: '洗涤厂早班延误，干净布草未到，A102 无法按时打扫',
    });
    await this.bookings.checkOut(b004.id);
    await this.reviews.create({
      bookingId: b004.id, rating: 3,
      content: '早餐去晚了没啥可吃的，等打扫等了很久，餐食准备一般。', category: 'food_prep',
    });

    // ---- 在住/今日到店 ----
    // 山景三间全占（为渠道超卖做铺垫）
    const b102 = (await this.bookings.create({
      channelCode: 'ctrip', roomTypeId: t1.id, roomId: R('A103').id,
      guestName: '孙涛', guestPhone: '13800005555',
      arrivalDate: mk(-1), departureDate: mk(1), adults: 2,
      breakfastPortions: 2, depositAmount: 300,
    })).booking;
    await this.bookings.checkIn(b102.id);

    const b105 = (await this.bookings.create({
      channelCode: 'meituan', roomTypeId: t1.id, roomId: R('A101').id,
      guestName: '周雨', guestPhone: '13800006666',
      arrivalDate: mk(-1), departureDate: mk(2), adults: 2,
      breakfastPortions: 2, depositAmount: 300,
    })).booking;
    await this.bookings.checkIn(b105.id);

    const b106 = (await this.bookings.create({
      channelCode: 'phone', roomTypeId: t1.id, roomId: R('A102').id,
      guestName: '吴姐（熟客）', guestPhone: '13800007777',
      arrivalDate: mk(0), departureDate: mk(3), adults: 2,
      breakfastPortions: 1, depositAmount: 300,
    })).booking;

    // 携程超卖：山景已满，强制登记待安置
    const b104 = (await this.bookings.create({
      channelCode: 'ctrip', roomTypeId: t1.id,
      guestName: '郑凯', guestPhone: '13800008888',
      arrivalDate: mk(0), departureDate: mk(2), adults: 2,
      breakfastPortions: 2, depositAmount: 300, forceOversell: true,
    })).booking;

    // 亲子房今日到店
    await this.bookings.create({
      channelCode: 'phone', roomTypeId: t2.id, roomId: R('B201').id,
      guestName: '林先生一家四口', guestPhone: '13800009999',
      arrivalDate: mk(0), departureDate: mk(2),
      adults: 2, children: 2, extraBeds: 1, breakfastPortions: 4,
      dietaryRestrictions: '孩子花生过敏，所有菜品避免花生及花生油',
      depositAmount: 800, invoiceRequired: true, invoiceTitle: '个人',
    });

    const bFam = (await this.bookings.create({
      channelCode: 'direct', roomTypeId: t2.id, roomId: R('B202').id,
      guestName: '何苗一家', guestPhone: '13800010000',
      arrivalDate: mk(-1), departureDate: mk(1),
      adults: 2, children: 1, breakfastPortions: 3,
      dietaryRestrictions: '乳糖不耐受', depositAmount: 500,
    })).booking;
    await this.bookings.checkIn(bFam.id);

    // 宠物房在住，空调故障待修（离店后封锁房间）
    const b103 = (await this.bookings.create({
      channelCode: 'miniapp', roomTypeId: t3.id, roomId: R('C302').id,
      guestName: '高翔与猫', guestPhone: '13800011223',
      arrivalDate: mk(-1), departureDate: mk(2),
      adults: 1, pets: 1, breakfastPortions: 1, depositAmount: 500,
    })).booking;
    await this.bookings.checkIn(b103.id);
    await this.maintenance.create({
      roomId: R('C302').id, bookingId: b103.id, category: 'ac',
      title: '空调异响', description: '开机后外机异响，客人在住先观察，离店后维修',
      blocksRoom: true, dateFrom: mk(2), dateTo: mk(3), repairCost: 0,
    });

    // 历史离店订单的保洁收尾（布草送达→打扫完成→回库）
    for (const bid of [b001.id, b002.id, b003.id]) {
      const detail = await this.bookings.detail(bid);
      for (const task of detail.cleaningTasks) {
        const req = (await this.hk.list()).find((t) => t.id === task.id)?.linenRequests?.[0];
        if (req) {
          try { await this.hk.deliverLinen(req.id); } catch { /* 库存不足忽略 */ }
        }
        await this.hk.patch(task.id, { status: 'done' });
      }
    }

    this.logger.log('种子数据写入完成：4 笔已结算历史单、7 笔在住/到店单、含超卖/布草/早餐/硬件/宠物异常');
  }
}
