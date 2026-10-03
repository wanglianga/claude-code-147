import { Body, Controller, Get, Post, Query , HttpCode} from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private catalog: CatalogService) {}

  @Get('overview')
  overview() {
    return this.catalog.overview();
  }

  @HttpCode(200)
  @Post('linen')
  setLinen(@Body() body: any) {
    return this.catalog.setLinen(body);
  }

  @HttpCode(200)
  @Post('prices')
  savePrices(@Body() body: { items: any[] }) {
    return this.catalog.savePriceCalendar(body.items || []);
  }

  @Get('inventory')
  inventory(@Query('from') from: string, @Query('to') to: string) {
    return this.catalog.inventoryRange(from, to);
  }

  @HttpCode(200)
  @Post('inventory')
  setInventory(@Body() body: { items: any[] }) {
    return this.catalog.setInventory(body.items || []);
  }
}
