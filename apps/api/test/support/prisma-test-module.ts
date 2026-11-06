import { ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validateEnv } from '../../src/config/env.validation';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * A Nest module with configuration and Prisma, connected to the test database (the setup
 * file already pointed DATABASE_URL at it), plus any extra modules under test. Callers must
 * `close()` the module.
 */
export async function createPrismaTestModule(
  extraImports: ModuleMetadata['imports'] = [],
): Promise<{
  moduleRef: TestingModule;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      PrismaModule,
      ...extraImports,
    ],
  }).compile();
  await moduleRef.init();

  return { moduleRef, prisma: moduleRef.get(PrismaService) };
}
