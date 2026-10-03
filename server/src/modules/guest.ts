import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Booking, Compensation, Incident, MaintenanceTicket, Review, Room,
} from '../entities';
import { round2 } from '../common/util';

// ================= 事件（住宿链路统一记录） =================
@Controller('incidents')
export class IncidentsController {
  constructor(
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(MaintenanceTicket) private maintenance: Repository<MaintenanceTicket>,
    private dataSource: DataSource,
  ) {}

  @Get()
  list(@Query('type') type?: string, @Query('status') status?: string) {
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    return this.incidents.find({ where, order: { occurredAt: 'DESC' } });
  }

  // 手工登记事件；宠物损坏会同步扣押金+建维修单，空调故障会同步建维修单+房态转维修
  @Post()
  async create(@Body() body: {
    type: string; bookingId?: number; roomId?: number; description: string; cost?: number;
  }) {
    if (!body.type || !body.description) throw new BadRequestException('事件类型与描述必填');
    const cost = body.cost || 0;
    return this.dataSource.transaction(async (em) => {
      const incident = await em.save(em.create(Incident, {
        type: body.type, bookingId: body.bookingId || null, roomId: body.roomId || null,
        description: body.description, status: 'open', cost,
      }));
      if (body.type === 'pet_damage') {
        if (body.bookingId) {
          const b = await em.findOne(Booking, { where: { id: body.bookingId } });
          if (b) {
            b.depositDeducted = round2(Math.min(Number(b.depositAmount), Number(b.depositDeducted) + cost));
            await em.save(b);
          }
        }
        if (body.roomId) {
          await em.save(em.create(MaintenanceTicket, {
            roomId: body.roomId, bookingId: body.bookingId || null, type: 'furniture',
            description: `宠物损坏：${body.description}`, status: 'open', cost,
          }));
        }
      }
      if (body.type === 'ac_failure' && body.roomId) {
        await em.save(em.create(MaintenanceTicket, {
          roomId: body.roomId, bookingId: body.bookingId || null, type: 'ac',
          description: `空调故障：${body.description}`, status: 'open', cost: 0,
        }));
        await em.update(Room, body.roomId, { status: 'maintenance' });
      }
      return incident;
    });
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: number, @Body() body: { resolution?: string; cost?: number }) {
    const it = await this.incidents.findOne({ where: { id } });
    if (!it) throw new NotFoundException('事件不存在');
    it.status = 'resolved';
    it.resolvedAt = new Date();
    it.resolution = body.resolution || '';
    if (body.cost !== undefined) it.cost = body.cost;
    return this.incidents.save(it);
  }
}

// ================= 差评 =================
@Controller('reviews')
export class ReviewsController {
  constructor(
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    private dataSource: DataSource,
  ) {}

  @Get()
  async list() {
    const rows = await this.reviews.find({ relations: ['booking', 'booking.channel', 'booking.room'], order: { id: 'DESC' } });
    return rows.map((r) => ({
      ...r,
      bookingCode: r.booking?.code,
      guestName: r.booking?.guestName,
      channel: (r.booking as any)?.channel?.name,
      room: (r.booking as any)?.room?.code,
    }));
  }

  // 登记评价；≤3 分自动生成差评事件进入住宿链路
  @Post()
  async create(@Body() body: { bookingId: number; rating: number; category: string; content: string }) {
    const b = await this.bookings.findOne({ where: { id: body.bookingId } });
    if (!b) throw new NotFoundException('订单不存在');
    if (!body.rating || body.rating < 1 || body.rating > 5) throw new BadRequestException('评分需为 1-5');
    if (!['hardware', 'service', 'oversell', 'food'].includes(body.category)) {
      throw new BadRequestException('分类需为 hardware/service/oversell/food');
    }
    return this.dataSource.transaction(async (em) => {
      const review = await em.save(em.create(Review, {
        bookingId: b.id, rating: body.rating, category: body.category, content: body.content || '',
      }));
      if (body.rating <= 3) {
        await em.save(em.create(Incident, {
          type: 'bad_review', bookingId: b.id, roomId: b.roomId,
          description: `差评（${body.rating}分/${body.category}）：${body.content}`,
          status: 'open', cost: 0,
        }));
      }
      return review;
    });
  }
}

// ================= 补偿 =================
@Controller('compensations')
export class CompensationsController {
  constructor(
    @InjectRepository(Compensation) private compensations: Repository<Compensation>,
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
    private dataSource: DataSource,
  ) {}

  @Get()
  list() {
    return this.compensations.find({ order: { id: 'DESC' } });
  }

  // 对差评发放补偿（现金/退款/补偿券），并联动关闭差评事件
  @Post('for-review/:reviewId')
  async compensate(@Param('reviewId') reviewId: number,
                   @Body() body: { type: string; amount: number; reason?: string }) {
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('评价不存在');
    if (!['cash', 'voucher', 'refund'].includes(body.type)) throw new BadRequestException('补偿类型不合法');
    if (!body.amount || body.amount <= 0) throw new BadRequestException('补偿金额需大于 0');
    return this.dataSource.transaction(async (em) => {
      const voucherCode = body.type === 'voucher'
        ? 'VC' + Math.random().toString(36).slice(2, 8).toUpperCase()
        : null;
      const comp = await em.save(em.create(Compensation, {
        reviewId: review.id, bookingId: review.bookingId, incidentId: null,
        type: body.type, amount: round2(body.amount), voucherCode,
        status: 'issued', reason: body.reason || '差评补偿',
      }));
      review.compensated = true;
      await em.save(review);
      await em.update(Incident, { bookingId: review.bookingId, type: 'bad_review', status: 'open' }, {
        status: 'resolved', resolvedAt: new Date(),
        resolution: `已补偿 ${body.type === 'voucher' ? `补偿券 ${voucherCode} ` : ''}¥${body.amount}`,
      });
      return comp;
    });
  }

  // 补偿券核销
  @Post(':id/use')
  async use(@Param('id') id: number) {
    const c = await this.compensations.findOne({ where: { id } });
    if (!c) throw new NotFoundException('补偿记录不存在');
    if (c.type !== 'voucher') throw new BadRequestException('仅补偿券可核销');
    if (c.status !== 'issued') throw new BadRequestException('该券已核销或作废');
    c.status = 'used';
    return this.compensations.save(c);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Incident, Booking, Room, MaintenanceTicket, Review, Compensation])],
  controllers: [IncidentsController, ReviewsController, CompensationsController],
})
export class GuestModule {}
