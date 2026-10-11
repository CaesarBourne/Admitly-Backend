import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeatGroup } from './entities/seat-group.entity';

const DEFAULT_MAX_SIZE = 8;

@Injectable()
export class SeatGroupsService {
  constructor(
    @InjectRepository(SeatGroup) private readonly repo: Repository<SeatGroup>,
  ) {}

  async create(
    orgId: string,
    eventId: string,
    name: string,
    maxSize: number | undefined,
  ): Promise<SeatGroup> {
    const trimmed = name.trim();
    const exists = await this.repo.findOne({ where: { eventId, name: trimmed } });
    if (exists) {
      throw new ConflictException('A seat group with that name already exists for this event.');
    }
    const group = this.repo.create({
      orgId,
      eventId,
      name: trimmed,
      maxSize: maxSize && maxSize > 0 ? maxSize : DEFAULT_MAX_SIZE,
    });
    return this.repo.save(group);
  }

  async findAllForEvent(eventId: string, orgId: string): Promise<SeatGroup[]> {
    return this.repo.find({
      where: { eventId, orgId },
      relations: ['invitees'],
      order: { createdAt: 'ASC' },
    });
  }

  /** Scoped lookup — throws if the group doesn't exist or belongs to another org. */
  async findForOrg(id: string, orgId: string): Promise<SeatGroup> {
    const group = await this.repo.findOne({ where: { id, orgId } });
    if (!group) throw new NotFoundException('Seat group not found.');
    return group;
  }

  async update(
    id: string,
    orgId: string,
    changes: { name?: string; maxSize?: number },
  ): Promise<SeatGroup> {
    const group = await this.findForOrg(id, orgId);
    if (changes.name !== undefined) group.name = changes.name.trim();
    if (changes.maxSize !== undefined && changes.maxSize > 0) group.maxSize = changes.maxSize;
    return this.repo.save(group);
  }

  async delete(id: string, orgId: string): Promise<void> {
    const group = await this.findForOrg(id, orgId);
    await this.repo.remove(group);
  }
}
