import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import {
  User, Channel, RoomType, Room, PriceCalendar, InventoryDay, Setting, Booking,
  CleaningTask, LinenStock, LinenRequest, MaintenanceTicket, BreakfastOrder,
  Incident, Review, Compensation, BillingRecord,
} from './entities';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { BookingsModule } from './bookings/bookings.module';
import { OperationsModule } from './operations/operations.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SeedService } from './seed';
import { SnakeNamingStrategy } from './naming.strategy';

const entities = [
  User, Channel, RoomType, Room, PriceCalendar, InventoryDay, Setting, Booking,
  CleaningTask, LinenStock, LinenRequest, MaintenanceTicket, BreakfastOrder,
  Incident, Review, Compensation, BillingRecord,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'homestay',
      entities,
      synchronize: true,
      namingStrategy: new SnakeNamingStrategy(),
    }),
    TypeOrmModule.forFeature([User, Channel, RoomType, Room, PriceCalendar, LinenStock]),
    AuthModule,
    CatalogModule,
    BookingsModule,
    OperationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    SeedService,
  ],
})
export class AppModule {}
