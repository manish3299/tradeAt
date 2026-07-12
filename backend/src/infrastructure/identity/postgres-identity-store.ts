import pg from 'pg';
import type {
  AuditEvent,
  Identity,
  IdentityStore,
  NewSession,
  RefreshRotationResult,
  Session,
  SessionPrincipal,
  SessionRotation,
  User,
  WorkspaceRole,
} from '../../domain/identity.js';

type DatabaseClient = Pick<pg.Pool | pg.PoolClient, 'query'>;

type UserRow = Readonly<{
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}>;

type IdentityRow = UserRow &
  Readonly<{
    workspace_id: string;
    workspace_name: string;
    workspace_created_at: Date;
    role: WorkspaceRole;
    membership_created_at: Date;
  }>;

type SessionRow = Readonly<{
  id: string;
  user_id: string;
  workspace_id: string;
  access_token_hash: string;
  access_expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
}>;

type RefreshRow = Readonly<{
  session_id: string;
  user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
}>;

export class PostgresIdentityStore implements IdentityStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 4 });
  }

  async createIdentity(identity: Identity): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into users (id, email, password_hash, created_at)
         values ($1, $2, $3, $4)`,
        [
          identity.user.id,
          identity.user.email,
          identity.user.passwordHash,
          identity.user.createdAt,
        ],
      );
      await client.query(
        `insert into workspaces (id, name, created_at)
         values ($1, $2, $3)`,
        [identity.workspace.id, identity.workspace.name, identity.workspace.createdAt],
      );
      await client.query(
        `insert into memberships (user_id, workspace_id, role, created_at)
         values ($1, $2, $3, $4)`,
        [
          identity.membership.userId,
          identity.membership.workspaceId,
          identity.membership.role,
          identity.membership.createdAt,
        ],
      );
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      if (isUniqueViolation(error)) return false;
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `select id, email, password_hash, created_at
       from users
       where email = $1`,
      [email],
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

  async findIdentityByUserId(userId: string): Promise<Identity | undefined> {
    const result = await this.pool.query<IdentityRow>(
      `select
         users.id,
         users.email,
         users.password_hash,
         users.created_at,
         workspaces.id as workspace_id,
         workspaces.name as workspace_name,
         workspaces.created_at as workspace_created_at,
         memberships.role,
         memberships.created_at as membership_created_at
       from users
       join memberships on memberships.user_id = users.id
       join workspaces on workspaces.id = memberships.workspace_id
       where users.id = $1
       order by memberships.created_at asc
       limit 1`,
      [userId],
    );
    return result.rows[0] ? toIdentity(result.rows[0]) : undefined;
  }

  async createSession(session: NewSession): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await insertSession(client, session);
      await insertRefreshToken(client, {
        refreshTokenHash: session.refreshTokenHash,
        sessionId: session.id,
        userId: session.userId,
        refreshExpiresAt: session.refreshExpiresAt,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveAccessToken(
    accessTokenHash: string,
    now: Date,
  ): Promise<SessionPrincipal | undefined> {
    const result = await this.pool.query<IdentityRow & { session_id: string }>(
      `select
         users.id,
         users.email,
         users.password_hash,
         users.created_at,
         workspaces.id as workspace_id,
         workspaces.name as workspace_name,
         workspaces.created_at as workspace_created_at,
         memberships.role,
         memberships.created_at as membership_created_at,
         sessions.id as session_id
       from sessions
       join users on users.id = sessions.user_id
       join workspaces on workspaces.id = sessions.workspace_id
       join memberships
         on memberships.user_id = users.id
        and memberships.workspace_id = workspaces.id
       where sessions.access_token_hash = $1
         and sessions.revoked_at is null
         and sessions.access_expires_at > $2`,
      [accessTokenHash, now],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const identity = toIdentity(row);
    return {
      user: {
        id: identity.user.id,
        email: identity.user.email,
        createdAt: identity.user.createdAt,
      },
      workspace: identity.workspace,
      membership: identity.membership,
      sessionId: row.session_id,
    };
  }

  async rotateRefreshToken(
    refreshTokenHash: string,
    replacement: SessionRotation,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const refreshResult = await client.query<RefreshRow>(
        `select session_id, user_id, expires_at, consumed_at
         from refresh_tokens
         where token_hash = $1
         for update`,
        [refreshTokenHash],
      );
      const refresh = refreshResult.rows[0];
      if (!refresh) {
        await client.query('rollback');
        return { status: 'invalid' };
      }
      if (refresh.consumed_at) {
        await revokeAllUserSessions(client, refresh.user_id, now);
        await client.query('commit');
        return { status: 'reused', userId: refresh.user_id };
      }

      const sessionResult = await client.query<SessionRow>(
        `select id, user_id, workspace_id, access_token_hash, access_expires_at, created_at, revoked_at
         from sessions
         where id = $1
         for update`,
        [refresh.session_id],
      );
      const current = sessionResult.rows[0];
      if (!current || current.revoked_at) {
        await client.query('rollback');
        return { status: 'invalid' };
      }
      if (refresh.expires_at <= now) {
        await client.query('rollback');
        return { status: 'expired' };
      }

      await client.query(
        `update refresh_tokens
         set consumed_at = $2
         where token_hash = $1`,
        [refreshTokenHash, now],
      );
      await client.query(
        `update sessions
         set revoked_at = $2
         where id = $1`,
        [current.id, now],
      );

      const nextSession: Session = {
        id: replacement.id,
        userId: current.user_id,
        workspaceId: current.workspace_id,
        accessTokenHash: replacement.accessTokenHash,
        accessExpiresAt: replacement.accessExpiresAt,
        refreshTokenHash: replacement.refreshTokenHash,
        refreshExpiresAt: replacement.refreshExpiresAt,
        createdAt: replacement.createdAt,
      };
      await insertSession(client, nextSession);
      await insertRefreshToken(client, {
        refreshTokenHash: nextSession.refreshTokenHash,
        sessionId: nextSession.id,
        userId: nextSession.userId,
        refreshExpiresAt: nextSession.refreshExpiresAt,
      });
      await client.query('commit');
      return { status: 'rotated', session: nextSession };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeByRefreshToken(refreshTokenHash: string, now: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const refreshResult = await client.query<RefreshRow>(
        `select session_id, user_id, expires_at, consumed_at
         from refresh_tokens
         where token_hash = $1
         for update`,
        [refreshTokenHash],
      );
      const refresh = refreshResult.rows[0];
      if (!refresh) {
        await client.query('rollback');
        return false;
      }
      await client.query(
        `update sessions
         set revoked_at = coalesce(revoked_at, $2)
         where id = $1`,
        [refresh.session_id, now],
      );
      await client.query(
        `update refresh_tokens
         set consumed_at = coalesce(consumed_at, $2)
         where token_hash = $1`,
        [refreshTokenHash, now],
      );
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `insert into audit_events (id, workspace_id, user_id, action, occurred_at, metadata)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        event.id,
        event.workspaceId ?? null,
        event.userId ?? null,
        event.action,
        event.occurredAt,
        event.metadata,
      ],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function insertSession(client: DatabaseClient, session: Session): Promise<void> {
  await client.query(
    `insert into sessions
       (id, user_id, workspace_id, access_token_hash, access_expires_at, created_at, revoked_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      session.id,
      session.userId,
      session.workspaceId,
      session.accessTokenHash,
      session.accessExpiresAt,
      session.createdAt,
      session.revokedAt ?? null,
    ],
  );
}

async function insertRefreshToken(
  client: DatabaseClient,
  input: Readonly<{
    refreshTokenHash: string;
    sessionId: string;
    userId: string;
    refreshExpiresAt: Date;
  }>,
): Promise<void> {
  await client.query(
    `insert into refresh_tokens (token_hash, session_id, user_id, expires_at)
     values ($1, $2, $3, $4)`,
    [input.refreshTokenHash, input.sessionId, input.userId, input.refreshExpiresAt],
  );
}

async function revokeAllUserSessions(
  client: DatabaseClient,
  userId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `update sessions
     set revoked_at = coalesce(revoked_at, $2)
     where user_id = $1`,
    [userId, now],
  );
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

function toIdentity(row: IdentityRow): Identity {
  return {
    user: toUser(row),
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
      createdAt: row.workspace_created_at,
    },
    membership: {
      userId: row.id,
      workspaceId: row.workspace_id,
      role: row.role,
      createdAt: row.membership_created_at,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === '23505';
}
