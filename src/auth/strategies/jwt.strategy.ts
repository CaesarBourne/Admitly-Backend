import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminUsersService } from '../../admin-users/admin-users.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { inviteeGroupInfo } from '../../invitees/entities/invitee.entity';
import { InviteesService } from '../../invitees/invitees.service';
import { OrganizationsService } from '../../organizations/organizations.service';

export interface JwtPayload {
  sub: string;
  type: 'admin' | 'invitee';
  orgId: string;
  eventId?: string;
  role?: Role;
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly adminUsers: AdminUsersService,
    private readonly invitees: InviteesService,
    private readonly organizations: OrganizationsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type === 'admin') {
      const admin = await this.adminUsers.findById(payload.sub).catch(() => null);
      if (!admin?.isActive) {
        throw new UnauthorizedException('Account is inactive or no longer exists.');
      }
      const org = await this.organizations.findById(admin.orgId);
      return {
        sub: admin.id,
        type: 'admin',
        orgId: admin.orgId,
        orgName: org.name,
        role: admin.role,
        email: admin.email,
        name: admin.name,
      };
    }

    const invitee = await this.invitees.findById(payload.sub);
    if (!invitee) {
      throw new UnauthorizedException('Account is inactive or no longer exists.');
    }
    if (payload.jti !== invitee.currentJti) {
      throw new UnauthorizedException(
        'This session has been superseded. Please re-scan your QR code.',
      );
    }
    return {
      sub: invitee.id,
      type: 'invitee',
      orgId: invitee.orgId,
      eventId: invitee.eventId,
      name: invitee.name,
      seatNumber: invitee.seatNumber,
      ...inviteeGroupInfo(invitee),
      inactive: invitee.inactive,
      admissionStatus: invitee.admissionStatus,
      jti: payload.jti,
    };
  }
}
