/** Roles for admin (organization staff) accounts. Invitee sessions carry no Role —
 *  they're distinguished by AuthUser.type === 'invitee' instead. */
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
}
