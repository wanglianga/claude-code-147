import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';

// ============ 基础资料 ============

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) username: string;
  @Column() passwordHash: string;
  @Column() name: string;
  @Column({ default: 'owner' }) role: string; // owner | manager | housekeeper | kitchen
  @Column({ default: () => `now()` }) createdAt: Date;
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string; // direct | miniapp | ctrip | meituan | phone
  @Column() name: string;
  @Column('numeric', { precision: 6, scale: 4, default: 0 }) commissionRate: number;
  @Column({ default: true }) active: boolean;
}

@Entity('room_types')
export class RoomType {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column('numeric', { precision: 10, scale: 2 }) basePrice: number;
  @Column({ default: 2 }) maxOccupancy: number;
  @Column({ default: false }) allowPets: boolean;
  @Column('numeric', { precision: 10, scale: 2, default: 0 }) petFee: number;
  @Column('numeric', { precision: 10, scale: 2, default: 120 }) extraBedPrice: number;
  @Column('numeric', { precision: 10, scale: 2, default: 68 }) breakfastPrice: number;
  @OneToMany('Room', 'roomType') rooms: Room[];
}

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) number: string;
  @Column() floor: number;
  @ManyToOne('RoomType', 'rooms', { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_type_id' })
  roomType: RoomType;
}

/** 旺季日历价：按房型+日期覆盖基础价 */
@Entity('price_calendar')
@Index(['roomTypeId', 'date'], { unique: true })
export class PriceCalendar {
  @PrimaryGeneratedColumn() id: number;
  @Column() roomTypeId: number;
  @Column({ type: 'date' }) date: string;
  @Column('numeric', { precision: 10, scale: 2 }) price: number;
}

/**
 * 每日可售房量（下一轮节假日排房时可按复盘结果调减/调增）。
 * 无记录时默认可售 = 该房型实际房间数。
 */
@Entity('inventory_days')
@Index(['roomTypeId', 'date'], { unique: true })
export class InventoryDay {
  @PrimaryGeneratedColumn() id: number;
  @Column() roomTypeId: number;
  @Column({ type: 'date' }) date: string;
  @Column() sellableRooms: number;
  @Column({ type: 'text', nullable: true }) note: string;
}

@Entity('settings')
export class Setting {
  @Column({ primary: true }) key: string;
  @Column({ type: 'jsonb' }) value: any;
}

// ============ 订单（住宿链路主线） ============

export type BookingStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string;
  @ManyToOne('Channel', undefined, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channel_id' }) channel: Channel;
  @ManyToOne('RoomType', undefined, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_type_id' }) roomType: RoomType;
  @ManyToOne('Room', undefined, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'room_id' }) room: Room | null;

  @Column() guestName: string;
  @Column({ nullable: true }) guestPhone: string;
  @Column({ type: 'date' }) arrivalDate: string;
  @Column({ type: 'date' }) departureDate: string;
  @Column() nights: number;
  @Column({ default: 'reserved' }) status: BookingStatus;

  @Column({ default: 1 }) adults: number;
  @Column({ default: 0 }) children: number;
  @Column({ default: 0 }) extraGuests: number; // 到店后临时增加的人数
  @Column({ default: 0 }) extraBeds: number;
  @Column({ default: 0 }) pets: number;
  @Column({ default: 0 }) breakfastPortions: number;
  @Column({ type: 'text', nullable: true }) dietaryRestrictions: string;

  @Column('numeric', { precision: 10, scale: 2, default: 0 }) depositAmount: number;
  @Column({ default: false }) invoiceRequired: boolean;
  @Column({ type: 'text', nullable: true }) invoiceTitle: string;

  @Column('numeric', { precision: 6, scale: 4, default: 0 }) commissionRate: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) roomFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) extraBedFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) breakfastFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) addOnFee: number; // 加人/宠物等
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) commissionAmount: number;
  @Column({ default: false }) forceOversold: boolean;
  @Column({ type: 'jsonb', nullable: true }) dailyRates: { date: string; price: number }[];

  @Column({ type: 'timestamptz', default: () => `now()` }) createdAt: Date;
}

// ============ 保洁 / 布草 / 维修 / 早餐 ============

@Entity('cleaning_tasks')
export class CleaningTask {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne('Booking', undefined, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking;
  @ManyToOne('Room', undefined, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'room_id' }) room: Room | null;
  @Column({ type: 'date' }) scheduledDate: string;
  @Column({ default: 'morning' }) slot: string; // morning | mid | evening
  @Column({ nullable: true }) assignee: string;
  @Column({ default: 'normal' }) dirtLevel: string; // light | normal | heavy
  @Column({ default: 'pending' }) status: string; // pending | in_progress | done | blocked
  @Column({ type: 'text', nullable: true }) blockedReason: string; // delayed_checkout | linen_shortage | maintenance
  @Column({ type: 'timestamptz', nullable: true }) startTime: Date;
  @Column({ type: 'timestamptz', nullable: true }) endTime: Date;
  @Column({ type: 'text', nullable: true }) note: string;
  @Column({ type: 'timestamptz', default: () => `now()` }) createdAt: Date;
}

/** 布草总库存（单行 id=1）：干净可用 / 洗涤中 / 合计 */
@Entity('linen_stock')
export class LinenStock {
  @PrimaryGeneratedColumn() id: number;
  @Column({ default: 0 }) packsTotal: number;
  @Column({ default: 0 }) packsAvailable: number;
  @Column({ default: 0 }) packsInWash: number;
}

@Entity('linen_requests')
export class LinenRequest {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne('CleaningTask', undefined, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cleaning_task_id' }) cleaningTask: CleaningTask;
  @Column({ default: 1 }) packsNeeded: number;
  @Column({ default: 'requested' }) status: string; // requested | delivered | returned
  @Column({ type: 'timestamptz', default: () => `now()` }) requestedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) deliveredAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) returnedAt: Date;
}

@Entity('maintenance_tickets')
export class MaintenanceTicket {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne('Room', undefined, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_id' }) room: Room;
  @ManyToOne('Booking', undefined, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking | null;
  @Column({ default: 'other' }) category: string; // ac | plumbing | furniture | electrical | other
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ default: 'open' }) status: string; // open | repairing | resolved
  @Column({ default: true }) blocksRoom: boolean;
  @Column({ type: 'date', nullable: true }) blockDateFrom: string;
  @Column({ type: 'date', nullable: true }) blockDateTo: string;
  @Column('numeric', { precision: 10, scale: 2, default: 0 }) repairCost: number;
  @Column({ type: 'timestamptz', default: () => `now()` }) reportedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt: Date;
  @Column({ type: 'text', nullable: true }) note: string;
}

@Entity('breakfast_orders')
@Index(['bookingId', 'date'], { unique: true })
export class BreakfastOrder {
  @PrimaryGeneratedColumn() id: number;
  @Column() bookingId: number;
  @ManyToOne('Booking', undefined, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking;
  @Column({ type: 'date' }) date: string;
  @Column({ default: 0 }) portions: number;
  @Column({ type: 'text', nullable: true }) dietaryRestrictions: string;
  @Column({ default: 'planned' }) status: string; // planned | prepared | served | shortage
  @Column({ type: 'text', nullable: true }) note: string;
  @Column({ type: 'timestamptz', default: () => `now()` }) createdAt: Date;
}

// ============ 异常事件 / 差评 / 补偿 / 结算 ============

/**
 * 8 类旺季异常，统一收口在同一条住宿链路（booking）上：
 * late_checkout 延迟退房 | room_fault 房间硬件故障 | linen_delay 布草未送达
 * extra_guest 临时加人 | pet_damage 宠物损坏 | breakfast_shortage 早餐供应不足
 * oversell 渠道超卖 | bad_review 差评
 */
@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string;
  @Column() type: string;
  @Column({ default: 'mid' }) severity: string; // low | mid | high
  @Column({ nullable: true }) bookingId: number;
  @Column({ nullable: true }) roomId: number;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ default: 'open' }) status: string; // open | processing | compensated | closed
  @Column({ type: 'jsonb', nullable: true }) meta: any;
  @Column({ type: 'timestamptz', default: () => `now()` }) occurredAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt: Date;
}

/** 差评归因：hardware 硬件 | service 服务 | oversell 超卖 | food_prep 餐食准备 | other */
@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn() id: number;
  @Column({ nullable: true }) bookingId: number;
  @ManyToOne('Booking', undefined, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking | null;
  @ManyToOne('Channel', undefined, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'channel_id' }) channel: Channel | null;
  @Column({ nullable: true }) authorName: string;
  @Column({ default: 5 }) rating: number;
  @Column({ type: 'text' }) content: string;
  @Column({ default: 'other' }) category: string;
  @Column({ default: 'posted' }) status: string; // posted | replied | compensated
  @Column({ type: 'text', nullable: true }) replyNote: string;
  @Column({ type: 'timestamptz', default: () => `now()` }) createdAt: Date;
}

/**
 * 补偿/扣除凭证。kind:
 * coupon 补偿券 | refund 退款 | upgrade 升级 | cash 现金赔付 | deposit_deduction 押金扣除
 */
@Entity('compensations')
export class Compensation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) code: string;
  @Column({ nullable: true }) bookingId: number;
  @ManyToOne('Booking', undefined, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking | null;
  @Column({ nullable: true }) incidentId: number;
  @Column({ nullable: true }) reviewId: number;
  @Column() kind: string;
  @Column({ type: 'text' }) reason: string;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) amount: number;
  @Column({ nullable: true }) couponCode: string;
  @Column({ default: 'issued' }) status: string; // issued | used | revoked
  @Column({ type: 'timestamptz', default: () => `now()` }) issuedAt: Date;
}

/** 结算单：一间订单一张，旺季利润复盘的最小单元 */
@Entity('billing_records')
export class BillingRecord {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) bookingId: number;
  @ManyToOne('Booking', undefined, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' }) booking: Booking;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) roomFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) extraBedFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) breakfastFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) addOnFee: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) commissionAmount: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) depositCollected: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) depositDeduction: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) refundCost: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) couponCost: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) cashCost: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) totalReceivable: number;
  @Column('numeric', { precision: 12, scale: 2, default: 0 }) netIncome: number;
  @Column({ type: 'jsonb', nullable: true }) breakdown: any;
  @Column({ type: 'timestamptz', default: () => `now()` }) settledAt: Date;
}
