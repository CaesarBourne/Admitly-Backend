import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;
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
    const event = await this.events.create(admin.orgId, dto.name, dto.eventDate ?? null);
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

  private toDto(e: Event) {
    return {
      id: e.id,
      name: e.name,
      eventDate: e.eventDate,
      createdAt: e.createdAt,
    };
  }
}
