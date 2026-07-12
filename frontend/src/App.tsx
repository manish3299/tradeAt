import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchApiHealth,
  fetchMe,
  login,
  logout,
  registerAccount,
  type ApiHealth,
  type AuthSession,
  type Principal,
} from './api';
import './styles.css';

const labels = {
  checking: 'Checking platform',
  ready: 'Platform ready',
  degraded: 'Dependencies degraded',
  unreachable: 'API unreachable',
} as const;

const sessionKey = 'tradeat.auth.session';

type AuthMode = 'register' | 'login';
type StoredSession = Pick<AuthSession, 'tokens'> & { principal: Principal };

export function App() {
  const [health, setHealth] = useState<ApiHealth | { state: 'checking' }>({ state: 'checking' });
  const [mode, setMode] = useState<AuthMode>('register');
  const [session, setSession] = useState<StoredSession | undefined>(() => readStoredSession());
  const [email, setEmail] = useState('trader@example.com');
  const [password, setPassword] = useState('strong-passphrase');
  const [workspaceName, setWorkspaceName] = useState('TradeAt Desk');
  const [message, setMessage] = useState('Create a local workspace to start the MVP flow.');
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchApiHealth(controller.signal).then(setHealth);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session?.tokens.accessToken) return;
    void fetchMe(session.tokens.accessToken)
      .then((principal) => {
        const updated = { ...session, principal };
        setSession(updated);
        localStorage.setItem(sessionKey, JSON.stringify(updated));
      })
      .catch(() => {
        setSession(undefined);
        localStorage.removeItem(sessionKey);
      });
  }, [session?.tokens.accessToken]);

  const targetCopy = useMemo(
    () =>
      mode === 'register'
        ? 'This creates your first workspace and signs you in.'
        : 'Use the same account to return to your workspace.',
    [mode],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(mode === 'register' ? 'Creating workspace...' : 'Signing in...');
    try {
      const result =
        mode === 'register'
          ? await registerAccount({ email, password, workspaceName })
          : await login({ email, password });
      setSession(result);
      localStorage.setItem(sessionKey, JSON.stringify(result));
      setMessage('Signed in. We can now attach market data and decisions to this workspace.');
    } catch {
      setMessage(mode === 'register' ? 'Could not create account.' : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    const refreshToken = session?.tokens.refreshToken;
    setSession(undefined);
    localStorage.removeItem(sessionKey);
    setMessage('Signed out.');
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        setMessage('Signed out locally. API logout did not respond.');
      }
    }
  }

  return (
    <main>
      <header>
        <a className="brand" href="/" aria-label="TradeAt home">
          TRADE<span>AT</span>
        </a>
        <span className={`status status--${health.state}`} role="status">
          <i aria-hidden="true" />
          {labels[health.state]}
        </span>
      </header>

      <section className="workspace" aria-labelledby="title">
        <div className="intro">
          <p className="eyebrow">Milestone 02</p>
          <h1 id="title">Secure workspace access</h1>
          <p className="lede">
            Authentication is now the front door for TradeAt. Once signed in, this workspace becomes
            the place where market data, decisions, replay, and paper trades will attach.
          </p>
        </div>

        {session ? (
          <section className="panel" aria-label="Signed in workspace">
            <p className="eyebrow">Active session</p>
            <h2>{session.principal.workspace.name}</h2>
            <dl className="session-grid">
              <div>
                <dt>User</dt>
                <dd>{session.principal.user.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{session.principal.membership.role}</dd>
              </div>
              <div>
                <dt>Access expires</dt>
                <dd>{formatDate(session.tokens.accessExpiresAt)}</dd>
              </div>
              <div>
                <dt>Next milestone</dt>
                <dd>Market data pipeline</dd>
              </div>
            </dl>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </section>
        ) : (
          <section className="panel" aria-label="Authentication">
            <div className="tabs" role="tablist" aria-label="Authentication mode">
              <button
                className={mode === 'register' ? 'tab tab--active' : 'tab'}
                type="button"
                onClick={() => setMode('register')}
              >
                Register
              </button>
              <button
                className={mode === 'login' ? 'tab tab--active' : 'tab'}
                type="button"
                onClick={() => setMode('login')}
              >
                Login
              </button>
            </div>
            <p className="hint">{targetCopy}</p>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  minLength={10}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {mode === 'register' ? (
                <label>
                  Workspace
                  <input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </label>
              ) : null}
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Working...' : mode === 'register' ? 'Create workspace' : 'Sign in'}
              </button>
            </form>
            <p className="message" aria-live="polite">
              {message}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

function readStoredSession(): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as StoredSession) : undefined;
  } catch {
    return undefined;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
