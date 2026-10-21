import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Event, groupLabelOf } from './entities/event.entity';
import { EventsService } from './events.service';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsBoolean()
  groupingEnabled?: boolean;

  /** Custom name for a group — "Table", "Team", "Cabin"… Defaults to "Group". */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  groupLabel?: string | null;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string | null;

  @IsOptional()
  @IsBoolean()
  groupingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  groupLabel?: string | null;
}

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an event for the current organization.' })
  async create(@CurrentUser() admin: AuthUser, @Body() dto: CreateEventDto) {
    const event = await this.events.create(admin.orgId, dto.name, dto.eventDate ?? null, {
      groupingEnabled: dto.groupingEnabled,
      groupLabel: dto.groupLabel,
    });
    return this.toDto(event);
  }

  @Get()
  @ApiOperation({ summary: "List the current organization's events." })
  async findAll(@CurrentUser() admin: AuthUser) {
    const events = await this.events.findAllForOrg(admin.orgId);
    return events.map((e) => this.toDto(e));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single event (must belong to your organization).' })
  async findOne(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    const event = await this.events.findForOrg(id, admin.orgId);
    return this.toDto(event);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event, including its optional grouping settings (admin+).' })
  async update(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    const event = await this.events.update(id, admin.orgId, dto);
    return this.toDto(event);
  }

  private toDto(e: Event) {
    return {
      id: e.id,
      name: e.name,
      eventDate: e.eventDate,
      groupingEnabled: e.groupingEnabled,
      groupLabel: groupLabelOf(e),
      createdAt: e.createdAt,
    };
  }
}
