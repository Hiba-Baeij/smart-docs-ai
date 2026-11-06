import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The single PrismaClient for the process. Prisma 7 talks to PostgreSQL through a driver
 * adapter, so the connection string is handed to `PrismaPg` here and nowhere else.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
      // Emitted as events and ignored unless something listens (a test counting statements).
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  /** Connect at start-up so an unreachable database stops the boot, not the first request. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
