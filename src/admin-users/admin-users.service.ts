import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { AdminUser } from './entities/admin-user.entity';

const SALT_ROUNDS = 12;

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AdminUser) private readonly repo: Repository<AdminUser>,
  ) {}

  async create(input: {
    orgId: string;
    email: string;
    password: string;
    name?: string;
    role?: Role;
  }): Promise<AdminUser> {
    const email = input.email.toLowerCase().trim();
    const exists = await this.repo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('An account with that email already exists.');
    }
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const admin = this.repo.create({
      orgId: input.orgId,
      email,
      passwordHash,
      name: input.name,
      role: input.role ?? Role.OWNER,
    });
    return this.repo.save(admin);
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    // passwordHash is select:false — must be explicitly added for login check
    return this.repo
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.email = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  async findById(id: string): Promise<AdminUser> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin account not found.');
    return admin;
  }

  async findAllForOrg(orgId: string): Promise<AdminUser[]> {
    return this.repo.find({ where: { orgId }, order: { createdAt: 'ASC' } });
  }

  async verifyPassword(admin: AdminUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, admin.passwordHash);
  }
}
