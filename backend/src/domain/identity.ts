export type WorkspaceRole = 'owner' | 'member';

export type User = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}>;

export type Workspace = Readonly<{
  id: string;
  name: string;
  createdAt: Date;
}>;

export type Membership = Readonly<{
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: Date;
}>;

export type Session = Readonly<{
  id: string;
  userId: string;
  workspaceId: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
}>;

export type AuditEvent = Readonly<{
  id: string;
  workspaceId?: string;
  userId?: string;
  action: string;
  occurredAt: Date;
  metadata: Readonly<Record<string, string | number | boolean>>;
}>;

export type Identity = Readonly<{
  user: User;
  workspace: Workspace;
  membership: Membership;
}>;

export type SessionPrincipal = Readonly<{
  user: Omit<User, 'passwordHash'>;
  workspace: Workspace;
  membership: Membership;
  sessionId: string;
}>;

export type NewSession = Session;

export type SessionRotation = Readonly<{
  id: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  createdAt: Date;
}>;

export type RefreshRotationResult =
  | Readonly<{ status: 'rotated'; session: Session }>
  | Readonly<{ status: 'reused'; userId: string }>
  | Readonly<{ status: 'invalid' | 'expired' }>;

export interface IdentityStore {
  createIdentity(identity: Identity): Promise<boolean>;
  findUserByEmail(email: string): Promise<User | undefined>;
  findIdentityByUserId(userId: string): Promise<Identity | undefined>;
  createSession(session: NewSession): Promise<void>;
  resolveAccessToken(accessTokenHash: string, now: Date): Promise<SessionPrincipal | undefined>;
  rotateRefreshToken(
    refreshTokenHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RefreshRotationResult>;
  revokeByRefreshToken(refreshTokenHash: string, now: Date): Promise<boolean>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface SecretGenerator {
  generate(): string;
  hash(secret: string): string;
}
