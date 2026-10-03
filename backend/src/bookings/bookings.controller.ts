import { Body, Controller, HttpCode, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { BookingsService, CreateBookingDto } from './bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private svc: BookingsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.svc.list({ status, channelCode: channel, from, to, keyword });
  }

  @Get('availability')
  availability(@Query('roomTypeId', ParseIntPipe) roomTypeId: number, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.availability(roomTypeId, from, to);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: CreateBookingDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @HttpCode(200)
  @Post(':id/assign-room')
  assignRoom(@Param('id', ParseIntPipe) id: number, @Body() body: { roomId: number }) {
    return this.svc.assignRoom(id, body.roomId);
  }

  @HttpCode(200)
  @Post(':id/check-in')
  checkIn(@Param('id', ParseIntPipe) id: number) {
    return this.svc.checkIn(id);
  }

  @HttpCode(200)
  @Post(':id/check-out')
  checkOut(@Param('id', ParseIntPipe) id: number) {
    return this.svc.checkOut(id);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(id);
  }
}
