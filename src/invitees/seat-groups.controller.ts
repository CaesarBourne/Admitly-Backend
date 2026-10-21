import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventsService } from '../events/events.service';
import { SeatGroup } from './entities/seat-group.entity';
import { SeatGroupsService } from './seat-groups.service';

export class CreateSeatGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxSize?: number;
}

export class UpdateSeatGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxSize?: number;
}

@ApiTags('seat-groups')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
@Controller()
export class SeatGroupsController {
  constructor(
    private readonly seatGroups: SeatGroupsService,
    private readonly events: EventsService,
  ) {}

  @Get('events/:eventId/seat-groups')
  @ApiOperation({ summary: 'List all invitee groups for an event with their invitee counts (admin+).' })
  async findAll(@CurrentUser() admin: AuthUser, @Param('eventId') eventId: string) {
    await this.events.findForOrg(eventId, admin.orgId);
    const groups = await this.seatGroups.findAllForEvent(eventId, admin.orgId);
    return groups.map((g) => this.toDto(g));
  }

  @Post('events/:eventId/seat-groups')
  @ApiOperation({ summary: 'Create a named invitee group for an event (admin+).' })
  async create(
    @CurrentUser() admin: AuthUser,
    @Param('eventId') eventId: string,
    @Body() dto: CreateSeatGroupDto,
  ) {
    await this.events.findForOrg(eventId, admin.orgId);
    const group = await this.seatGroups.create(admin.orgId, eventId, dto.name, dto.maxSize);
    return this.toDto(group);
  }

  @Patch('seat-groups/:id')
  @ApiOperation({ summary: 'Rename a group or change its max size (admin+).' })
  async update(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSeatGroupDto,
  ) {
    const group = await this.seatGroups.update(id, admin.orgId, dto);
    return this.toDto(group);
  }

  @Delete('seat-groups/:id')
  @ApiOperation({ summary: "Delete a group (its invitees keep their seat number, admin+)." })
  async delete(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    await this.seatGroups.delete(id, admin.orgId);
    return { deleted: true };
  }

  private toDto(g: SeatGroup) {
    return {
      id: g.id,
      eventId: g.eventId,
      name: g.name,
      maxSize: g.maxSize,
      guestCount: g.invitees?.length ?? 0,
      createdAt: g.createdAt,
    };
  }
}
