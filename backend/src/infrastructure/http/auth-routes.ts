import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AuthError,
  type AuthService,
  type AuthenticatedSession,
} from '../../application/auth-service.js';

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(10).max(256);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  workspaceName: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  const authRateLimiter = createInMemoryRateLimiter({
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });

  app.addHook('preHandler', (request, reply, done) => {
    if (!shouldRateLimit(request)) {
      done();
      return;
    }

    const result = authRateLimiter.check(`${request.ip}:${request.method}:${request.url}`);
    if (!result.allowed) {
      reply.header('retry-after', String(result.retryAfterSeconds));
      reply.code(429).send({ error: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds });
      return;
    }

    done();
  });

  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const result = await auth.register(input);
    return sendAuthenticated(reply, 201, result);
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await auth.login(input);
    return sendAuthenticated(reply, 200, result);
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const result = await auth.refresh(input.refreshToken);
    return sendAuthenticated(reply, 200, result);
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const revoked = await auth.logout(input.refreshToken);
    return reply.code(200).send({ revoked });
  });

  app.get('/api/v1/me', async (request, reply) => {
    const accessToken = readBearerToken(request);
    if (!accessToken) return reply.code(401).send({ error: 'missing_bearer_token' });

    const principal = await auth.authenticate(accessToken);
    if (!principal) return reply.code(401).send({ error: 'invalid_token' });

    return reply.code(200).send({ principal });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(error.statusCode).send({ error: error.code });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
    }
    throw error;
  });
}

function sendAuthenticated(
  reply: FastifyReply,
  statusCode: 200 | 201,
  result: AuthenticatedSession,
): FastifyReply {
  return reply.code(statusCode).send({
    principal: result.principal,
    tokens: {
      accessToken: result.tokens.accessToken,
      accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      refreshToken: result.tokens.refreshToken,
      refreshExpiresAt: result.tokens.refreshExpiresAt.toISOString(),
    },
  });
}

function readBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function shouldRateLimit(request: FastifyRequest): boolean {
  return request.method === 'POST' && request.url.startsWith('/api/v1/auth/');
}

function createInMemoryRateLimiter(options: Readonly<{ limit: number; windowMs: number }>): {
  check(key: string): Readonly<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
} {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true };
      }

      if (existing.count >= options.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
        };
      }

      existing.count += 1;
      return { allowed: true };
    },
  };
}
