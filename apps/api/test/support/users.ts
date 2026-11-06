import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword } from '../../src/auth/password';
import { PrismaService } from '../../src/prisma/prisma.service';

export type TestUser = { id: string; cookie: string };

/** A real user row and a valid session cookie for them, signed with the app's own secret. */
export async function createUserWithCookie(
  app: INestApplication,
  name: string,
): Promise<TestUser> {
  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: {
      name,
      email: `${name}@example.com`,
      passwordHash: await hashPassword('correct horse battery'),
    },
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id });
  return { id: user.id, cookie: `sid=${token}` };
}
