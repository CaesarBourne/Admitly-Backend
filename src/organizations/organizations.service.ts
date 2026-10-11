import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org'
  );
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly repo: Repository<Organization>,
  ) {}

  /** Creates an organization with a unique slug derived from its name. */
  async create(name: string): Promise<Organization> {
    const base = slugify(name);
    let slug = base;
    let suffix = 1;
    while (await this.repo.findOne({ where: { slug } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    const org = this.repo.create({ name: name.trim(), slug });
    return this.repo.save(org);
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found.');
    return org;
  }
}
