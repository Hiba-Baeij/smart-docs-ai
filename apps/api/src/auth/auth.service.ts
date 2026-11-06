import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserSummary } from '@smartdocs/contracts';
import {
  InvalidCredentialsError,
  UnauthorizedError,
} from '../common/errors/app-error';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

export type LoginResult = {
  user: UserSummary;
  token: string;
  /** How long the token lives, so the cookie can expire at the same moment. */
  expiresInMs: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Hashes the password and creates the user. Email normalisation and duplicate detection
   * live in UsersService; this class only owns the credential rules.
   */
  async register(dto: RegisterDto): Promise<UserSummary> {
    const passwordHash = await hashPassword(dto.password);
    return this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });
  }

  /**
   * The caller's own profile, for session restore after a page reload. The token can outlive its
   * user (an account deleted while a token is still valid); that is a session for nobody, so it
   * is the same AUTH_REQUIRED as any other failed authentication.
   */
  async me(userId: string): Promise<UserSummary> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return user;
  }

  /**
   * Checks the credentials and signs a token whose only claim is the user id (`sub`).
   * Exactly one bcrypt comparison always runs, against a dummy hash when the email is unknown,
   * and both failures throw the same error, so neither the body nor the response time says
   * which of the two was wrong.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const credentials = await this.users.findCredentialsByEmail(dto.email);
    const passwordMatches = await verifyPassword(
      dto.password,
      credentials?.passwordHash ?? DUMMY_HASH,
    );

    if (!credentials || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const token = await this.jwt.signAsync({ sub: credentials.user.id });
    const { iat, exp } = this.jwt.decode<{ iat: number; exp: number }>(token);

    return { user: credentials.user, token, expiresInMs: (exp - iat) * 1000 };
  }
}
