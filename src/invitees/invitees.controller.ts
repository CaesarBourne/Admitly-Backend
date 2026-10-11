import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventsService } from '../events/events.service';
import { Invitee } from './entities/invitee.entity';
import { InviteesService } from './invitees.service';

export class CreateInviteeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class SetSeatDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  seatNumber: string | null;
}

export class SetSeatGroupDto {
  @IsString()
  @IsOptional()
  seatGroupId: string | null;
}

export class SetInactiveDto {
  @IsBoolean()
  inactive: boolean;
}

@ApiTags('invitees')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
@Controller()
export class InviteesController {
  constructor(
    private readonly invitees: InviteesService,
    private readonly events: EventsService,
  ) {}

  @Post('events/:eventId/invitees')
  @ApiOperation({ summary: 'Create an invitee with a QR token for an event (admin+).' })
  async create(
    @CurrentUser() admin: AuthUser,
    @Param('eventId') eventId: string,
    @Body() dto: CreateInviteeDto,
  ) {
    await this.events.findForOrg(eventId, admin.orgId);
    const invitee = await this.invitees.create(admin.orgId, eventId, dto.name);
    return this.toDto(invitee);
  }

  @Get('events/:eventId/invitees')
  @ApiOperation({ summary: 'List all invitees for an event (admin+).' })
  async findAll(@CurrentUser() admin: AuthUser, @Param('eventId') eventId: string) {
    await this.events.findForOrg(eventId, admin.orgId);
    const invitees = await this.invitees.findAllForEvent(eventId, admin.orgId);
    return invitees.map((i) => this.toDto(i));
  }

  @Get('invitees/:id')
  @ApiOperation({ summary: 'Get a single invitee (admin+).' })
  async findOne(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    const invitee = await this.invitees.findForOrg(id, admin.orgId);
    return this.toDto(invitee);
  }

  @Patch('invitees/:id/seat')
  @ApiOperation({ summary: 'Set (or clear) an invitee seat number (admin+).' })
  async setSeat(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetSeatDto) {
    await this.invitees.setSeat(id, admin.orgId, dto.seatNumber ?? null);
    return { id, seatNumber: dto.seatNumber ?? null };
  }

  @Patch('invitees/:id/seat-group')
  @ApiOperation({ summary: "Assign (or clear) an invitee's seat group (admin+)." })
  async setSeatGroup(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetSeatGroupDto,
  ) {
    await this.invitees.setSeatGroup(id, admin.orgId, dto.seatGroupId ?? null);
    return { id, seatGroupId: dto.seatGroupId ?? null };
  }

  @Patch('invitees/:id/inactive')
  @ApiOperation({
    summary:
      "Mark an invitee inactive (not attending, or disabled for any reason), or reactivate them (admin+). Invite/QR stays intact.",
  })
  async setInactive(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetInactiveDto,
  ) {
    await this.invitees.setInactive(id, admin.orgId, dto.inactive);
    return { id, inactive: dto.inactive };
  }

  @Delete('invitees/:id')
  @ApiOperation({ summary: 'Delete an invitee (admin+).' })
  async delete(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    await this.invitees.delete(id, admin.orgId);
    return { deleted: true };
  }

  @Post('invitees/:id/admit')
  @ApiOperation({ summary: 'Mark an invitee as admitted at the entrance scan point (admin+).' })
  async admit(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    const invitee = await this.invitees.admit(id, admin.orgId);
    return { id: invitee.id, admissionStatus: invitee.admissionStatus, admittedAt: invitee.admittedAt };
  }

  @Post('invitees/:id/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Admin uploads an invitee's photo (admin+)." })
  async uploadAvatar(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException('No file uploaded.');
    await this.invitees.setAvatar(id, admin.orgId, file);
    return { avatarUrl: `/invitees/${id}/avatar` };
  }

  /** Public so <img> tags can load it without extra headers — resolves a
   *  short-lived signed URL from the private storage bucket on every call. */
  @Public()
  @Get('invitees/:id/avatar')
  @ApiOperation({ summary: "Serve an invitee's photo (public, signed-URL redirect)." })
  async getAvatar(@Param('id') id: string, @Res() res: Response) {
    const url = await this.invitees.getAvatarUrl(id);
    if (!url) throw new NotFoundException('No photo set for this invitee.');
    res.set('Cache-Control', 'private, max-age=60');
    return res.redirect(302, url);
  }

  private toDto(i: Invitee) {
    return {
      id: i.id,
      eventId: i.eventId,
      name: i.name,
      inviteToken: i.inviteToken,
      seatNumber: i.seatNumber ?? null,
      seatGroup: i.seatGroup ? { id: i.seatGroup.id, name: i.seatGroup.name } : null,
      admissionStatus: i.admissionStatus,
      admittedAt: i.admittedAt,
      inactive: i.inactive,
      avatarUrl: i.avatarPath ? `/invitees/${i.id}/avatar` : null,
      createdAt: i.createdAt,
    };
  }
}
