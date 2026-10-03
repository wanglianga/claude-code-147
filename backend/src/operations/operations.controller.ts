import { Body, Controller, HttpCode, Get, Param, ParseIntPipe, Post, Patch, Query } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';
import { KitchenService } from './kitchen.service';
import { MaintenanceService } from './maintenance.service';
import { IncidentsService } from './incidents.service';
import { ReviewsService } from './reviews.service';
import { CompensationsService } from './compensations.service';
import { BillingService } from './billing.service';
import { AnalyticsService } from './analytics.service';

@Controller()
export class OperationsController {
  constructor(
    private hk: HousekeepingService,
    private kitchen: KitchenService,
    private maint: MaintenanceService,
    private incidents: IncidentsService,
    private reviews: ReviewsService,
    private comps: CompensationsService,
    private billing: BillingService,
    private analytics: AnalyticsService,
  ) {}

  // ---- 运营总览 / 复盘 / 排房 ----
  @Get('dashboard')
  dashboard(@Query('date') date: string) {
    return this.analytics.dashboard(date);
  }

  @Get('analytics/season-review')
  seasonReview(@Query('from') from: string, @Query('to') to: string) {
    return this.analytics.seasonReview(from, to);
  }

  @Get('analytics/allocation-plan')
  allocationPlan(
    @Query('pastFrom') pastFrom: string, @Query('pastTo') pastTo: string,
    @Query('nextFrom') nextFrom: string, @Query('nextTo') nextTo: string,
    @Query('apply') apply?: string,
  ) {
    return this.analytics.allocationPlan(pastFrom, pastTo, nextFrom, nextTo, apply === 'true');
  }

  // ---- 管家/保洁/布草 ----
  @Get('housekeeping/tasks')
  tasks(@Query('date') date?: string, @Query('status') status?: string) {
    return this.hk.list(date, status);
  }

  @Patch('housekeeping/tasks/:id')
  patchTask(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.hk.patch(id, body);
  }

  @Get('housekeeping/linen')
  linen() {
    return this.hk.stockInfo();
  }

  @HttpCode(200)
  @Post('housekeeping/linen/deliver/:requestId')
  deliverLinen(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.hk.deliverLinen(requestId);
  }

  @HttpCode(200)
  @Post('housekeeping/linen/wash-complete')
  washComplete(@Body() body: { packs: number }) {
    return this.hk.washComplete(Number(body.packs));
  }

  // ---- 厨房 ----
  @Get('kitchen/board')
  kitchenBoard(@Query('from') from: string, @Query('to') to: string) {
    return this.kitchen.board(from, to);
  }

  @Patch('kitchen/orders/:id')
  patchKitchenOrder(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.kitchen.patchOrder(id, body);
  }

  // ---- 维修 ----
  @Get('maintenance')
  maintenanceList(@Query('status') status?: string) {
    return this.maint.list(status);
  }

  @HttpCode(200)
  @Post('maintenance')
  maintenanceCreate(@Body() body: any) {
    return this.maint.create(body);
  }

  @Patch('maintenance/:id')
  maintenancePatch(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.maint.patch(id, body);
  }

  // ---- 异常事件 ----
  @Get('incidents')
  incidentList(@Query('type') type?: string, @Query('status') status?: string, @Query('bookingId') bookingId?: string) {
    return this.incidents.list({ type, status, bookingId: bookingId ? Number(bookingId) : undefined });
  }

  @HttpCode(200)
  @Post('incidents')
  incidentCreate(@Body() body: any) {
    return this.incidents.create(body);
  }

  @HttpCode(200)
  @Post('incidents/:id/process')
  incidentProcess(@Param('id', ParseIntPipe) id: number, @Body() body: { note?: string }) {
    return this.incidents.process(id, body?.note);
  }

  @HttpCode(200)
  @Post('incidents/:id/resolve')
  incidentResolve(@Param('id', ParseIntPipe) id: number, @Body() body: { note?: string }) {
    return this.incidents.resolve(id, body?.note);
  }

  // ---- 差评 ----
  @Get('reviews')
  reviewList(@Query('status') status?: string, @Query('category') category?: string) {
    return this.reviews.list(status, category);
  }

  @HttpCode(200)
  @Post('reviews')
  reviewCreate(@Body() body: any) {
    return this.reviews.create(body);
  }

  @HttpCode(200)
  @Post('reviews/:id/categorize')
  categorize(@Param('id', ParseIntPipe) id: number, @Body() body: { category: string }) {
    return this.reviews.categorize(id, body.category);
  }

  @HttpCode(200)
  @Post('reviews/:id/reply')
  reply(@Param('id', ParseIntPipe) id: number, @Body() body: { replyNote: string }) {
    return this.reviews.reply(id, body.replyNote);
  }

  // ---- 补偿 ----
  @Get('compensations')
  compList(@Query('bookingId') bookingId?: string) {
    return this.comps.list(bookingId ? Number(bookingId) : undefined);
  }

  @Get('compensations/suggestions/:bookingId')
  suggestions(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.comps.suggestions(bookingId);
  }

  @HttpCode(200)
  @Post('compensations')
  issue(@Body() body: any) {
    return this.comps.issue(body);
  }

  @HttpCode(200)
  @Post('compensations/:id/revoke')
  revoke(@Param('id', ParseIntPipe) id: number) {
    return this.comps.revoke(id);
  }

  // ---- 结算 ----
  @Get('billing')
  billingList(@Query('from') from?: string, @Query('to') to?: string, @Query('channel') channel?: string) {
    return this.billing.list({ from, to, channelCode: channel });
  }

  @HttpCode(200)
  @Post('billing/settle/:bookingId')
  settle(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.billing.settle(bookingId);
  }

  @HttpCode(200)
  @Post('billing/revoke/:bookingId')
  revokeBilling(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.billing.revoke(bookingId);
  }
}
