import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';

/** App-wide (platform) administrators only. This is deliberately separate from
 *  the organization-scoped `Role`: a platform admin can change limits for every
 *  account, while an org owner only ever sees their own organization. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest() as { user?: AuthUser };
    if (!user || user.type !== 'admin' || !user.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access required.');
    }
    return true;
  }
}
