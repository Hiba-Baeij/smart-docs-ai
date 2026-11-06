import { TestingModule } from '@nestjs/testing';
import { PrismaService } from './../src/prisma/prisma.service';
import { createPrismaTestModule } from './support/prisma-test-module';

describe('PrismaService (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ moduleRef, prisma } = await createPrismaTestModule());
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('connects and answers SELECT 1', async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;

    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('is connected to the test database, never the development one', async () => {
    const rows = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;

    expect(rows[0].name).toMatch(/_test$/);
  });
});
