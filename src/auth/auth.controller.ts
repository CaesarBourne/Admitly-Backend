import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { inviteeGroupInfo } from '../invitees/entities/invitee.entity';
import { AuthService } from './auth.service';
import { InviteeTokenDto } from './dto/invitee-token.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Create a new organization and its first (owner) admin account.' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate an admin and receive a JWT.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Public endpoint: invitee exchanges their QR token for a short-lived JWT.
   *  Every call invalidates the previous session (one active device). */
  @Public()
  @Post('invitee')
  @ApiOperation({ summary: 'Exchange an invitee QR token for a JWT (magic link).' })
  inviteeLogin(@Body() dto: InviteeTokenDto) {
    return this.authService.inviteeLogin(dto.token);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the currently authenticated session (admin or invitee).' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Admin looks up an invitee by their QR token without logging in as them.
   *  Used by the entrance-validation scan flow. Org-scoped. */
  @Post('invitee-info')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Return invitee profile from a QR token (admin+, does not create a session).' })
  async inviteeInfo(@CurrentUser() admin: AuthUser, @Body() dto: InviteeTokenDto) {
    const invitee = await this.authService.inviteeInfo(dto.token, admin.orgId);
    return {
      id: invitee.id,
      eventId: invitee.eventId,
      name: invitee.name,
      admissionStatus: invitee.admissionStatus,
      admittedAt: invitee.admittedAt,
      seatNumber: invitee.seatNumber,
      ...inviteeGroupInfo(invitee),
      avatarUrl: invitee.avatarPath ? `/invitees/${invitee.id}/avatar` : null,
    };
  }
}
