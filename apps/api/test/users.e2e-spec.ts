import { TestingModule } from '@nestjs/testing';
import { EmailTakenError } from './../src/common/errors/app-error';
import { PrismaService } from './../src/prisma/prisma.service';
import { UsersModule } from './../src/users/users.module';
import { UsersService } from './../src/users/users.service';
import { createPrismaTestModule } from './support/prisma-test-module';
import { resetDatabase } from './support/test-database';

describe('UsersService (e2e, real database)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let users: UsersService;

  beforeAll(async () => {
    ({ moduleRef, prisma } = await createPrismaTestModule([UsersModule]));
    users = moduleRef.get(UsersService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const input = (email: string) => ({
    name: 'Sara Ahmed',
    email,
    passwordHash: 'a-precomputed-hash',
  });

  describe('create', () => {
    it('stores the normalised email and returns exactly the safe fields', async () => {
      const created = await users.create(input('  Sara@Example.COM '));

      expect(Object.keys(created).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
      ]);
      expect(created.email).toBe('sara@example.com');
      expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(stored.email).toBe('sara@example.com');
      expect(stored.passwordHash).toBe('a-precomputed-hash');
    });

    it('rejects a duplicate that differs only in case or whitespace', async () => {
      await users.create(input('sara@example.com'));

      const second = users.create(input('  SARA@Example.com'));

      await expect(second).rejects.toBeInstanceOf(EmailTakenError);
      await expect(second).rejects.toMatchObject({
        code: 'AUTH_EMAIL_TAKEN',
        statusCode: 409,
      });
      expect(await prisma.user.count()).toBe(1);
    });

    it('lets exactly one of two simultaneous registrations succeed', async () => {
      const results = await Promise.allSettled([
        users.create(input('race@example.com')),
        users.create(input('Race@Example.com')),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(EmailTakenError);
      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('findCredentialsByEmail', () => {
    it('finds the user by any spelling of the address and returns the hash', async () => {
      const created = await users.create(input('sara@example.com'));

      const found = await users.findCredentialsByEmail('  SARA@example.com ');

      expect(found?.user.id).toBe(created.id);
      expect(found?.passwordHash).toBe('a-precomputed-hash');
    });

    it('returns null for an unknown email', async () => {
      expect(
        await users.findCredentialsByEmail('nobody@example.com'),
      ).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the safe profile and never the hash', async () => {
      const created = await users.create(input('sara@example.com'));

      const found = await users.findById(created.id);

      expect(found).toEqual(created);
      expect(JSON.stringify(found)).not.toContain('a-precomputed-hash');
      expect(found).not.toHaveProperty('passwordHash');
    });

    it('returns null for an unknown id', async () => {
      expect(
        await users.findById('00000000-0000-7000-8000-00000000ffff'),
      ).toBeNull();
    });
  });
});
