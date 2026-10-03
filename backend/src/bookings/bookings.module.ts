import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking, Channel, RoomType, Room, PriceCalendar, InventoryDay,
  CleaningTask, BreakfastOrder, Incident, LinenRequest, MaintenanceTicket,
  Review, Compensation, BillingRecord,
} from '../entities';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    Booking, Channel, RoomType, Room, PriceCalendar, InventoryDay,
    CleaningTask, BreakfastOrder, Incident, LinenRequest, MaintenanceTicket,
    Review, Compensation, BillingRecord,
  ])],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService, TypeOrmModule],
})
export class BookingsModule {}
