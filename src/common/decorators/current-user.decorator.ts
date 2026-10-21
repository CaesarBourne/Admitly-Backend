import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/**
 * Two kinds of authenticated session share this shape:
 *  - 'admin'   — an organization staff member (owner/admin). Scoped by orgId;
 *                every query an admin makes must filter by this orgId.
 *  - 'invitee' — a guest who scanned their QR / followed their invite link.
 *                Scoped by orgId + eventId, one active device via jti.
 */
export interface AuthUser {
  sub: string;
  type: 'admin' | 'invitee';
  orgId: string;
  orgName?: string;
  eventId?: string;
  role?: Role;
  email?: string | null;
  name?: string;
  seatNumber?: string | null;
  seatGroupName?: string | null;
  groupLabel?: string;
  inactive?: boolean;
  admissionStatus?: 'pending' | 'admitted';
  jti?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
