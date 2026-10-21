import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
  ) {}

  async create(
    orgId: string,
    name: string,
    eventDate: string | null,
    grouping: { groupingEnabled?: boolean; groupLabel?: string | null } = {},
  ): Promise<Event> {
    const event = this.repo.create({
      orgId,
      name: name.trim(),
      eventDate: eventDate ? new Date(eventDate) : null,
      groupingEnabled: grouping.groupingEnabled ?? false,
      groupLabel: grouping.groupLabel?.trim() || null,
    });
    return this.repo.save(event);
  }

  async update(
    id: string,
    orgId: string,
    changes: { name?: string; eventDate?: string | null; groupingEnabled?: boolean; groupLabel?: string | null },
  ): Promise<Event> {
    const event = await this.findForOrg(id, orgId);
    if (changes.name !== undefined) event.name = changes.name.trim();
    if (changes.eventDate !== undefined) {
      event.eventDate = changes.eventDate ? new Date(changes.eventDate) : null;
    }
    if (changes.groupingEnabled !== undefined) event.groupingEnabled = changes.groupingEnabled;
    if (changes.groupLabel !== undefined) event.groupLabel = changes.groupLabel?.trim() || null;
    return this.repo.save(event);
  }

  async findAllForOrg(orgId: string): Promise<Event[]> {
    return this.repo.find({ where: { orgId }, order: { createdAt: 'DESC' } });
  }

  /** Scoped lookup — throws if the event doesn't exist or belongs to another org. */
  async findForOrg(id: string, orgId: string): Promise<Event> {
    const event = await this.repo.findOne({ where: { id, orgId } });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }
}
