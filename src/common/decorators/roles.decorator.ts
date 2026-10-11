import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
/** Restricts a route to admin sessions with one of the given roles. Invitee
 *  sessions never pass, regardless of the roles listed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
