import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    UsersModule,
    // One limiter, applied only where a route opts in with ThrottlerGuard (login and register).
    // It is named "default" so the standard Retry-After header is used. The client is identified
    // by the connection's address, which a forged X-Forwarded-For cannot change (Express does
    // not trust that header unless "trust proxy" is set explicitly).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            limit: config.getOrThrow<number>('AUTH_RATE_LIMIT'),
            ttl: config.getOrThrow<number>('AUTH_RATE_WINDOW_MS'),
          },
        ],
      }),
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          // Validated at start-up as "<number><s|m|h|d>", which is what the library expects.
          expiresIn: config.getOrThrow<string>(
            'JWT_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // Feature modules import AuthModule to use @UseGuards(JwtAuthGuard).
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
