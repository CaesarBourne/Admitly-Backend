import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { StorageModule } from '../storage/storage.module';
import { Invitee } from './entities/invitee.entity';
import { SeatGroup } from './entities/seat-group.entity';
import { InviteesController } from './invitees.controller';
import { InviteesService } from './invitees.service';
import { SeatGroupsController } from './seat-groups.controller';
import { SeatGroupsService } from './seat-groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invitee, SeatGroup]), EventsModule, StorageModule],
  controllers: [InviteesController, SeatGroupsController],
  providers: [InviteesService, SeatGroupsService],
  exports: [InviteesService, SeatGroupsService],
})
export class InviteesModule {}
