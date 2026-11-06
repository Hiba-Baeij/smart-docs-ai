import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { UserSummary } from '@smartdocs/contracts';
import type { Response } from 'express';
import { InvalidCredentialsError } from '../common/errors/app-error';
import { AuthService } from './auth.service';
import { ClearSessionCookieOnUnauthorizedFilter } from './clear-session-cookie.filter';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from './session-cookie';

@Controller('auth')
@UseFilters(ClearSessionCookieOnUnauthorizedFilter)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get cookieSecure(): boolean {
    return this.config.getOrThrow<boolean>('COOKIE_SECURE');
  }

  /** 201 `{ user }`. No auto-login: keeping registration and login separate keeps them testable. */
  @Post('register')
  @UseGuards(ThrottlerGuard)
  async register(@Body() dto: RegisterDto): Promise<{ user: UserSummary }> {
    return { user: await this.auth.register(dto) };
  }

  /**
   * 200 `{ user }` and the session cookie. The token never appears in the body: the browser
   * keeps it in an HttpOnly cookie that script cannot read. A failed login also clears any
   * existing session cookie, with the same attributes it was set with.
   */
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: UserSummary }> {
    try {
      const { user, token, expiresInMs } = await this.auth.login(dto);
      response.cookie(
        SESSION_COOKIE_NAME,
        token,
        sessionCookieOptions(this.cookieSecure, expiresInMs),
      );
      return { user };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        response.clearCookie(
          SESSION_COOKIE_NAME,
          clearSessionCookieOptions(this.cookieSecure),
        );
      }
      throw error;
    }
  }

  /**
   * 204 and the cookie removed. Only the server can remove an HttpOnly cookie, so clearing the
   * client's own state is not enough. The token itself is stateless and stays cryptographically
   * valid until it expires (one hour); that is the accepted v1 trade-off (no refresh tokens, no
   * revocation list), mitigated by the short lifetime.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(
      SESSION_COOKIE_NAME,
      clearSessionCookieOptions(this.cookieSecure),
    );
  }

  /** The caller's profile, flat (`{ id, name, email, createdAt }`) as in api-contract.md. Never the hash. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() userId: string): Promise<UserSummary> {
    return this.auth.me(userId);
  }
}
