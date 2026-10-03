import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from '../health.controller';
import {
  Booking, Channel, RoomType, Room, PriceCalendar, InventoryDay,
  CleaningTask, BreakfastOrder, Incident, LinenRequest, LinenStock,
  MaintenanceTicket, Review, Compensation, BillingRecord,
} from '../entities';
import { BookingsModule } from '../bookings/bookings.module';
import { OperationsController } from './operations.controller';
import { HousekeepingService } from './housekeeping.service';
import { KitchenService } from './kitchen.service';
import { MaintenanceService } from './maintenance.service';
import { IncidentsService } from './incidents.service';
import { ReviewsService } from './reviews.service';
import { CompensationsService } from './compensations.service';
import { BillingService } from './billing.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking, Channel, RoomType, Room, PriceCalendar, InventoryDay,
      CleaningTask, BreakfastOrder, Incident, LinenRequest, LinenStock,
      MaintenanceTicket, Review, Compensation, BillingRecord,
    ]),
    BookingsModule,
  ],
  controllers: [OperationsController, HealthController],
  providers: [
    HousekeepingService, KitchenService, MaintenanceService, IncidentsService,
    ReviewsService, CompensationsService, BillingService, AnalyticsService,
  ],
  exports: [
    HousekeepingService, KitchenService, MaintenanceService, IncidentsService,
    ReviewsService, CompensationsService, BillingService, AnalyticsService,
  ],
})
export class OperationsModule {}
