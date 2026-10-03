import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, Channel, Compensation, Incident, Review } from '../entities';
import { genCode, num, round2 } from '../common';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private reviews: Repository<Review>,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
    @InjectRepository(Channel) private channels: Repository<Channel>,
    @InjectRepository(Incident) private incidents: Repository<Incident>,
  ) {}

  async list(status?: string, category?: string) {
    const qb = this.reviews.createQueryBuilder('rv')
      .leftJoinAndSelect('rv.booking', 'b')
      .leftJoinAndSelect('rv.channel', 'c')
      .orderBy('rv.created_at', 'DESC');
    if (status) qb.andWhere('rv.status = :status', { status });
    if (category) qb.andWhere('rv.category = :category', { category });
    return qb.getMany();
  }

  async create(dto: {
    bookingId?: number; channelCode?: string; authorName?: string;
    rating: number; content: string; category?: string;
  }) {
    let booking: Booking | null = null;
    let channel: Channel | null = null;
    if (dto.bookingId) {
      booking = await this.bookings.findOne({ where: { id: dto.bookingId } });
      if (!booking) throw new NotFoundException('关联订单不存在');
      channel = booking.channel;
    } else if (dto.channelCode) {
      channel = await this.channels.findOne({ where: { code: dto.channelCode } });
    }
    const review = this.reviews.create({
      booking, channel,
      authorName: dto.authorName || booking?.guestName || '匿名客人',
      rating: dto.rating, content: dto.content,
      category: dto.category || this.inferCategory(dto.content),
      status: 'posted',
    });
    const saved = await this.reviews.save(review);
    // 低分差评（<=3）自动挂事件进入同一住宿链路
    if (saved.rating <= 3) {
      await this.incidents.save(this.incidents.create({
        code: genCode('INC'), type: 'bad_review', severity: saved.rating <= 2 ? 'high' : 'mid',
        bookingId: booking?.id || null,
        roomId: booking?.room?.id || null,
        title: `${saved.rating} 星差评（${saved.authorName}）`,
        description: saved.content,
        status: 'open',
        meta: { reviewId: saved.id, category: saved.category },
      }));
    }
    return saved;
  }

  private inferCategory(content: string): string {
    const t = content || '';
    if (/空调|热水|床|马桶|电视|wifi|网络|硬件|设施|坏|漏水|噪音|隔音/.test(t)) return 'hardware';
    if (/超卖|没房|换房|预订|取消订单|到店无房/.test(t)) return 'oversell';
    if (/早餐|餐|吃的|忌口|食材|味道/.test(t)) return 'food_prep';
    if (/态度|服务|保洁|布草|脏|等|没人理|响应/.test(t)) return 'service';
    return 'other';
  }

  async categorize(id: number, category: string) {
    const r = await this.reviews.findOne({ where: { id } });
    if (!r) throw new NotFoundException('差评不存在');
    if (!['hardware', 'service', 'oversell', 'food_prep', 'other'].includes(category)) {
      throw new BadRequestException('归因类型不合法');
    }
    r.category = category;
    return this.reviews.save(r);
  }

  async reply(id: number, replyNote: string) {
    const r = await this.reviews.findOne({ where: { id } });
    if (!r) throw new NotFoundException('差评不存在');
    r.replyNote = replyNote;
    r.status = 'replied';
    return this.reviews.save(r);
  }

  async markCompensated(id: number) {
    const r = await this.reviews.findOne({ where: { id } });
    if (!r) throw new NotFoundException('差评不存在');
    r.status = 'compensated';
    return this.reviews.save(r);
  }
}
