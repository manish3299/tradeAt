import type {
  AuditEvent,
  Identity,
  IdentityStore,
  NewSession,
  RefreshRotationResult,
  SessionRotation,
  Session,
  SessionPrincipal,
  User,
} from '../../domain/identity.js';

type RefreshRecord = Readonly<{
  sessionId: string;
  userId: string;
  expiresAt: Date;
  consumedAt?: Date;
}>;

export class InMemoryIdentityStore implements IdentityStore {
  private readonly usersById = new Map<string, User>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly identitiesByUserId = new Map<string, Identity>();
  private readonly sessionsById = new Map<string, Session>();
  private readonly refreshRecords = new Map<string, RefreshRecord>();
  private readonly auditEvents: AuditEvent[] = [];

  createIdentity(identity: Identity): Promise<boolean> {
    if (this.userIdByEmail.has(identity.user.email)) return Promise.resolve(false);
    this.usersById.set(identity.user.id, identity.user);
    this.userIdByEmail.set(identity.user.email, identity.user.id);
    this.identitiesByUserId.set(identity.user.id, identity);
    return Promise.resolve(true);
  }

  findUserByEmail(email: string): Promise<User | undefined> {
    const id = this.userIdByEmail.get(email);
    return Promise.resolve(id ? this.usersById.get(id) : undefined);
  }

  findIdentityByUserId(userId: string): Promise<Identity | undefined> {
    return Promise.resolve(this.identitiesByUserId.get(userId));
  }

  createSession(session: NewSession): Promise<void> {
    this.sessionsById.set(session.id, session);
    this.refreshRecords.set(session.refreshTokenHash, {
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.refreshExpiresAt,
    });
    return Promise.resolve();
  }

  resolveAccessToken(accessTokenHash: string, now: Date): Promise<SessionPrincipal | undefined> {
    const session = [...this.sessionsById.values()].find(
      (candidate) => candidate.accessTokenHash === accessTokenHash,
    );
    if (!session || session.revokedAt || session.accessExpiresAt <= now) {
      return Promise.resolve(undefined);
    }
    const identity = this.identitiesByUserId.get(session.userId);
    if (!identity || identity.workspace.id !== session.workspaceId)
      return Promise.resolve(undefined);
    return Promise.resolve({
      user: {
        id: identity.user.id,
        email: identity.user.email,
        createdAt: identity.user.createdAt,
      },
      workspace: identity.workspace,
      membership: identity.membership,
      sessionId: session.id,
    });
  }

  async rotateRefreshToken(
    refreshTokenHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const record = this.refreshRecords.get(refreshTokenHash);
    if (!record) return { status: 'invalid' };
    if (record.consumedAt) {
      this.revokeAllUserSessions(record.userId, now);
      return { status: 'reused', userId: record.userId };
    }
    const current = this.sessionsById.get(record.sessionId);
    if (!current || current.revokedAt) return { status: 'invalid' };
    if (record.expiresAt <= now) return { status: 'expired' };

    this.refreshRecords.set(refreshTokenHash, { ...record, consumedAt: now });
    this.sessionsById.set(current.id, { ...current, revokedAt: now });
    const nextSession: Session = {
      ...replacement,
      userId: current.userId,
      workspaceId: current.workspaceId,
    };
    await this.createSession(nextSession);
    return { status: 'rotated', session: nextSession };
  }

  revokeByRefreshToken(refreshTokenHash: string, now: Date): Promise<boolean> {
    const record = this.refreshRecords.get(refreshTokenHash);
    if (!record) return Promise.resolve(false);
    const session = this.sessionsById.get(record.sessionId);
    if (session && !session.revokedAt) {
      this.sessionsById.set(session.id, { ...session, revokedAt: now });
    }
    if (!record.consumedAt) {
      this.refreshRecords.set(refreshTokenHash, { ...record, consumedAt: now });
    }
    return Promise.resolve(true);
  }

  appendAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(event);
    return Promise.resolve();
  }

  getAuditEvents(): readonly AuditEvent[] {
    return this.auditEvents;
  }

  private revokeAllUserSessions(userId: string, now: Date): void {
    for (const [id, session] of this.sessionsById) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessionsById.set(id, { ...session, revokedAt: now });
      }
    }
  }
}
