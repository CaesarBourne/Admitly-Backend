import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { Role } from '../common/enums/role.enum';
import { Invitee, inviteeGroupInfo } from '../invitees/entities/invitee.entity';
import { InviteesService } from '../invitees/invitees.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export interface AdminAuthResult {
  accessToken: string;
  user: {
    id: string;
    orgId: string;
    orgName: string;
    email: string;
    name?: string;
    role: Role;
  };
}

export interface InviteeAuthResult {
  accessToken: string;
  user: {
    id: string;
    orgId: string;
    eventId: string;
    name: string;
    seatNumber: string | null;
    seatGroupName: string | null;
    groupLabel: string;
    inactive: boolean;
    admissionStatus: 'pending' | 'admitted';
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly adminUsers: AdminUsersService,
    private readonly invitees: InviteesService,
    private readonly jwtService: JwtService,
  ) {}

  /** Creates a brand-new organization plus its first (owner) admin account. */
  async signup(dto: SignupDto): Promise<AdminAuthResult> {
    const org = await this.organizations.create(dto.orgName);
    const admin = await this.adminUsers.create({
      orgId: org.id,
      email: dto.email,
      password: dto.password,
      name: dto.name,
      role: Role.OWNER,
    });
    return {
      accessToken: this.signAdmin(admin.id, org.id, admin.role),
      user: { id: admin.id, orgId: org.id, orgName: org.name, email: admin.email, name: admin.name, role: admin.role },
    };
  }

  async login(dto: LoginDto): Promise<AdminAuthResult> {
    const admin = await this.adminUsers.findByEmail(dto.email);
    if (!admin?.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const valid = await this.adminUsers.verifyPassword(admin, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const org = await this.organizations.findById(admin.orgId);
    return {
      accessToken: this.signAdmin(admin.id, admin.orgId, admin.role),
      user: { id: admin.id, orgId: org.id, orgName: org.name, email: admin.email, name: admin.name, role: admin.role },
    };
  }

  /** Exchanges an invitee QR token for a JWT. Issues a new jti so any previous
   *  device session is immediately invalidated (one-device enforcement). */
  async inviteeLogin(token: string): Promise<InviteeAuthResult> {
    const invitee = await this.invitees.findByToken(token);
    if (!invitee) {
      throw new UnauthorizedException('Invalid or expired invite link.');
    }
    const jti = randomUUID();
    await this.invitees.setCurrentJti(invitee.id, jti);
    return {
      accessToken: this.signInvitee(invitee, jti),
      user: this.inviteeSummary(invitee),
    };
  }

  /** Admin looks up an invitee by QR token without creating a session —
   *  used by the entrance scan flow. Scoped to the admin's own organization. */
  async inviteeInfo(token: string, requesterOrgId: string): Promise<Invitee> {
    const invitee = await this.invitees.findByToken(token);
    if (!invitee || invitee.orgId !== requesterOrgId) {
      throw new NotFoundException('Invitee not found or token invalid.');
    }
    return invitee;
  }

  private signAdmin(adminId: string, orgId: string, role: Role): string {
    return this.jwtService.sign({ sub: adminId, type: 'admin', orgId, role });
  }

  private signInvitee(invitee: Invitee, jti: string): string {
    return this.jwtService.sign({
      sub: invitee.id,
      type: 'invitee',
      orgId: invitee.orgId,
      eventId: invitee.eventId,
      jti,
    });
  }

  private inviteeSummary(invitee: Invitee) {
    return {
      id: invitee.id,
      orgId: invitee.orgId,
      eventId: invitee.eventId,
      name: invitee.name,
      seatNumber: invitee.seatNumber,
      ...inviteeGroupInfo(invitee),
      inactive: invitee.inactive,
      admissionStatus: invitee.admissionStatus,
    };
  }
}
