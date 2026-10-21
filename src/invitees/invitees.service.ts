import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { Invitee } from './entities/invitee.entity';
import { SeatGroup } from './entities/seat-group.entity';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Injectable()
export class InviteesService {
  constructor(
    @InjectRepository(Invitee) private readonly repo: Repository<Invitee>,
    @InjectRepository(SeatGroup) private readonly seatGroupRepo: Repository<SeatGroup>,
    private readonly storage: StorageService,
  ) {}

  async create(orgId: string, eventId: string, name: string): Promise<Invitee> {
    const inviteToken = randomBytes(32).toString('hex');
    const invitee = this.repo.create({
      orgId,
      eventId,
      name: name.trim(),
      inviteToken,
    });
    return this.repo.save(invitee);
  }

  async findAllForEvent(eventId: string, orgId: string): Promise<Invitee[]> {
    return this.repo.find({
      where: { eventId, orgId },
      relations: ['seatGroup'],
      order: { createdAt: 'ASC' },
    });
  }

  /** Scoped lookup — throws if the invitee doesn't exist or belongs to another org. */
  async findForOrg(id: string, orgId: string): Promise<Invitee> {
    const invitee = await this.repo.findOne({ where: { id, orgId }, relations: ['seatGroup', 'event'] });
    if (!invitee) throw new NotFoundException('Invitee not found.');
    return invitee;
  }

  /** Unscoped lookup by id — used by the public avatar redirect and JWT validation. */
  async findById(id: string): Promise<Invitee | null> {
    return this.repo.findOne({ where: { id }, relations: ['seatGroup', 'event'] });
  }

  findByToken(token: string): Promise<Invitee | null> {
    return this.repo.findOne({ where: { inviteToken: token }, relations: ['seatGroup', 'event'] });
  }

  async setCurrentJti(id: string, jti: string): Promise<void> {
    await this.repo.update(id, { currentJti: jti });
  }

  async setSeat(id: string, orgId: string, seatNumber: string | null): Promise<void> {
    const invitee = await this.findForOrg(id, orgId);
    if (seatNumber) {
      const existing = await this.repo.findOne({ where: { eventId: invitee.eventId, seatNumber } });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Seat ${seatNumber} is already assigned to ${existing.name || 'another invitee'}.`,
        );
      }
    }
    await this.repo.update(id, { seatNumber });
  }

  /** Assigns (or clears) an invitee's group, enforcing that group's maxSize. */
  async setSeatGroup(id: string, orgId: string, seatGroupId: string | null): Promise<void> {
    const invitee = await this.findForOrg(id, orgId);

    if (seatGroupId) {
      const group = await this.seatGroupRepo.findOne({ where: { id: seatGroupId, orgId } });
      if (!group) throw new NotFoundException('Group not found.');
      if (group.eventId !== invitee.eventId) {
        throw new ForbiddenException('That group belongs to a different event.');
      }

      if (invitee.seatGroupId !== seatGroupId) {
        const count = await this.repo.count({ where: { seatGroupId } });
        if (count >= group.maxSize) {
          throw new ConflictException(`"${group.name}" already has ${group.maxSize} invitees assigned.`);
        }
      }
    }

    await this.repo.update(id, { seatGroupId });
  }

  async setInactive(id: string, orgId: string, inactive: boolean): Promise<void> {
    await this.findForOrg(id, orgId);
    await this.repo.update(id, { inactive });
  }

  async admit(id: string, orgId: string): Promise<Invitee> {
    const invitee = await this.findForOrg(id, orgId);
    if (invitee.admissionStatus === 'admitted') return invitee;
    invitee.admissionStatus = 'admitted';
    invitee.admittedAt = new Date();
    return this.repo.save(invitee);
  }

  async delete(id: string, orgId: string): Promise<void> {
    const invitee = await this.findForOrg(id, orgId);
    await this.repo.remove(invitee);
  }

  async setAvatar(
    id: string,
    orgId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<void> {
    const invitee = await this.findForOrg(id, orgId);
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new ForbiddenException('Only JPEG, PNG, WebP, and GIF photos are allowed.');
    }
    const objectPath = `${orgId}/${invitee.id}/${Date.now()}-${file.originalname || 'avatar'}`;
    await this.storage.upload(objectPath, file.buffer, file.mimetype);
    await this.repo.update(id, { avatarPath: objectPath });
  }

  /** Signed, short-lived URL for the invitee's photo — null if none is set. */
  async getAvatarUrl(id: string): Promise<string | null> {
    const invitee = await this.repo.findOne({ where: { id } });
    if (!invitee?.avatarPath) return null;
    return this.storage.getSignedUrl(invitee.avatarPath);
  }
}
