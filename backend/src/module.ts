import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { DataService } from './service';
class RecordDto {
  @IsString() @Length(1, 100) title!: string;
  @IsString() @Length(1, 300) detail!: string;
}
@Controller('api')
class AppController {
  constructor(private readonly data: DataService) {}
  @Get('status') status() { return this.data.status(); }
  @Get(':store/records') list(@Param('store') store: string) { return this.data.list(store); }
  @Post(':store/records') create(@Param('store') store: string, @Body() dto: RecordDto) { return this.data.create(store, dto); }
  @Put(':store/records/:id') update(@Param('store') store: string, @Param('id') id: string, @Body() dto: RecordDto) { return this.data.update(store, id, dto); }
  @Delete(':store/records/:id') remove(@Param('store') store: string, @Param('id') id: string) { return this.data.remove(store, id); }
}
@Module({ controllers: [AppController], providers: [DataService] })
export class AppModule {}
