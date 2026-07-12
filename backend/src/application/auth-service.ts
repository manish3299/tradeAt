import { randomUUID } from 'node:crypto';
import type {
  AuditEvent,
  Clock,
  Identity,
  IdentityStore,
  PasswordHasher,
  SecretGenerator,
  Session,
  SessionPrincipal,
  SessionRotation,
  User,
  Workspace,
} from '../domain/identity.js';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH =
  'scrypt$v=1$n=16384$r=8$p=1$Rb9N8Nwx0KKy27sDAUFVGg$-BqrWWbCOPDJuQnbURVf6cHFYIydAJVrLas7gnMrHiTUZxnupPkD1RgrX9znZi2d2nCmPXu7PJkdVPIgdiJg8g';

export type AuthTokens = Readonly<{
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}>;

export type AuthenticatedSession = Readonly<{
  principal: SessionPrincipal;
  tokens: AuthTokens;
}>;

export type RegisterInput = Readonly<{
  email: string;
  password: string;
  workspaceName?: string | undefined;
}>;

export type LoginInput = Readonly<{
  email: string;
  password: string;
}>;

export class AuthError extends Error {
  constructor(
    readonly code: 'invalid_credentials' | 'email_taken' | 'invalid_token' | 'token_reused',
    readonly statusCode: 400 | 401 | 409 = 401,
  ) {
    super(code);
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class AuthService {
  constructor(
    private readonly store: IdentityStore,
    private readonly hasher: PasswordHasher,
    private readonly secrets: SecretGenerator,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async register(input: RegisterInput): Promise<AuthenticatedSession> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const user: User = {
      id: userId,
      email,
      passwordHash: await this.hasher.hash(input.password),
      createdAt: now,
    };
    const workspace: Workspace = {
      id: workspaceId,
      name: input.workspaceName?.trim() || defaultWorkspaceName(email),
      createdAt: now,
    };
    const identity: Identity = {
      user,
      workspace,
      membership: { userId, workspaceId, role: 'owner', createdAt: now },
    };

    const created = await this.store.createIdentity(identity);
    if (!created) throw new AuthError('email_taken', 409);

    await this.audit('auth.registered', now, { userId, workspaceId, metadata: { email } });
    return this.startSession(identity, now, 'auth.logged_in');
  }

  async login(input: LoginInput): Promise<AuthenticatedSession> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const user = await this.store.findUserByEmail(email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.hasher.verify(input.password, passwordHash);
    if (!user || !passwordMatches) {
      await this.audit('auth.login_failed', now, { metadata: { email } });
      throw new AuthError('invalid_credentials');
    }

    const identity = await this.store.findIdentityByUserId(user.id);
    if (!identity) throw new AuthError('invalid_credentials');
    return this.startSession(identity, now, 'auth.logged_in');
  }

  async refresh(refreshToken: string): Promise<AuthenticatedSession> {
    const now = this.clock.now();
    const rotation = this.createRotation(now);
    const result = await this.store.rotateRefreshToken(
      this.secrets.hash(refreshToken),
      rotation,
      now,
    );
    if (result.status === 'reused') {
      await this.audit('auth.refresh_reused', now, {
        userId: result.userId,
        metadata: { reason: 'refresh token reuse detected' },
      });
      throw new AuthError('token_reused');
    }
    if (result.status !== 'rotated') throw new AuthError('invalid_token');

    const principal = await this.store.resolveAccessToken(rotation.accessTokenHash, now);
    if (!principal) throw new AuthError('invalid_token');
    await this.audit('auth.refreshed', now, {
      userId: principal.user.id,
      workspaceId: principal.workspace.id,
      metadata: { sessionId: result.session.id },
    });
    return {
      principal,
      tokens: {
        accessToken: rotation.rawAccessToken,
        accessExpiresAt: rotation.accessExpiresAt,
        refreshToken: rotation.rawRefreshToken,
        refreshExpiresAt: rotation.refreshExpiresAt,
      },
    };
  }

  async logout(refreshToken: string): Promise<boolean> {
    const now = this.clock.now();
    const revoked = await this.store.revokeByRefreshToken(this.secrets.hash(refreshToken), now);
    await this.audit('auth.logged_out', now, { metadata: { revoked } });
    return revoked;
  }

  async authenticate(accessToken: string): Promise<SessionPrincipal | undefined> {
    return this.store.resolveAccessToken(this.secrets.hash(accessToken), this.clock.now());
  }

  private async startSession(
    identity: Identity,
    now: Date,
    auditAction: string,
  ): Promise<AuthenticatedSession> {
    const created = this.createSession(identity, now);
    await this.store.createSession(created.session);
    await this.audit(auditAction, now, {
      userId: identity.user.id,
      workspaceId: identity.workspace.id,
      metadata: { sessionId: created.session.id },
    });
    const principal = toPrincipal(identity, created.session.id);
    return { principal, tokens: created.tokens };
  }

  private createSession(
    identity: Identity,
    now: Date,
  ): Readonly<{ session: Session; tokens: AuthTokens }> {
    const accessToken = this.secrets.generate();
    const refreshToken = this.secrets.generate();
    const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const session: Session = {
      id: randomUUID(),
      userId: identity.user.id,
      workspaceId: identity.workspace.id,
      accessTokenHash: this.secrets.hash(accessToken),
      accessExpiresAt,
      refreshTokenHash: this.secrets.hash(refreshToken),
      refreshExpiresAt,
      createdAt: now,
    };
    return { session, tokens: { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt } };
  }

  private createRotation(now: Date): SessionRotation & {
    rawAccessToken: string;
    rawRefreshToken: string;
  } {
    const rawAccessToken = this.secrets.generate();
    const rawRefreshToken = this.secrets.generate();
    return {
      id: randomUUID(),
      accessTokenHash: this.secrets.hash(rawAccessToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshTokenHash: this.secrets.hash(rawRefreshToken),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      createdAt: now,
      rawAccessToken,
      rawRefreshToken,
    };
  }

  private async audit(
    action: string,
    occurredAt: Date,
    options: Readonly<{
      userId?: string;
      workspaceId?: string;
      metadata: Readonly<Record<string, string | number | boolean>>;
    }>,
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      action,
      occurredAt,
      metadata: options.metadata,
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    };
    await this.store.appendAuditEvent(event);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function defaultWorkspaceName(email: string): string {
  return `${email.split('@')[0] ?? 'TradeAt'} workspace`;
}

function toPrincipal(identity: Identity, sessionId: string): SessionPrincipal {
  return {
    user: {
      id: identity.user.id,
      email: identity.user.email,
      createdAt: identity.user.createdAt,
    },
    workspace: identity.workspace,
    membership: identity.membership,
    sessionId,
  };
}
