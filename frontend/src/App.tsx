import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchApiHealth,
  fetchIndicators,
  fetchInstruments,
  fetchMarketBars,
  fetchMarketStatus,
  fetchMe,
  fetchRegime,
  login,
  logout,
  registerAccount,
  runHistoricalReplay,
  createPaperAccount,
  submitPaperOrder,
  processPaperBar,
  fetchPaperSnapshot,
  type ApiHealth,
  type AuthSession,
  type IndicatorValue,
  type Instrument,
  type MarketBar,
  type MarketStatus,
  type Principal,
  type RegimeClassification,
  type ReplayResearchResult,
  type PaperAccount,
  type PaperSnapshot,
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
  const [instruments, setInstruments] = useState<readonly Instrument[]>([]);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('nse-nifty50');
  const [bars, setBars] = useState<readonly MarketBar[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | undefined>();
  const [indicatorValues, setIndicatorValues] = useState<readonly IndicatorValue[]>([]);
  const [regime, setRegime] = useState<RegimeClassification | undefined>();
  const [replayResult, setReplayResult] = useState<ReplayResearchResult | undefined>();
  const [isRunningReplay, setRunningReplay] = useState(false);
  const [trainingBars, setTrainingBars] = useState(2);
  const [evaluationBars, setEvaluationBars] = useState(2);
  const [minimumSamples, setMinimumSamples] = useState(30);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | undefined>();
  const [paperSnapshot, setPaperSnapshot] = useState<PaperSnapshot | undefined>();
  const [paperSide, setPaperSide] = useState<'buy' | 'sell'>('buy');
  const [paperQuantity, setPaperQuantity] = useState(1);
  const [paperConfirmed, setPaperConfirmed] = useState(false);
  const [isPaperWorking, setPaperWorking] = useState(false);

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

  useEffect(() => {
    if (!session) return;
    void fetchInstruments()
      .then((nextInstruments) => {
        setInstruments(nextInstruments);
        if (!nextInstruments.some((instrument) => instrument.id === selectedInstrumentId)) {
          setSelectedInstrumentId(nextInstruments[0]?.id ?? '');
        }
      })
      .catch(() => setMessage('Market instruments are not available yet.'));
  }, [session, selectedInstrumentId]);

  useEffect(() => {
    if (!session || !selectedInstrumentId) return;
    void Promise.all([
      fetchMarketBars(selectedInstrumentId),
      fetchMarketStatus(selectedInstrumentId),
      fetchIndicators(selectedInstrumentId),
      fetchRegime(selectedInstrumentId),
    ])
      .then(([nextBars, nextStatus, nextIndicators, nextRegime]) => {
        setBars(nextBars);
        setMarketStatus(nextStatus);
        setIndicatorValues(nextIndicators);
        setRegime(nextRegime);
      })
      .catch(() => setMessage('Market data is not available yet.'));
  }, [session, selectedInstrumentId]);

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

  async function handleReplay() {
    const accessToken = session?.tokens.accessToken;
    if (!accessToken || !selectedInstrumentId) return;
    setRunningReplay(true);
    setReplayResult(undefined);
    setMessage('Running a pinned historical replay...');
    try {
      const result = await runHistoricalReplay(accessToken, {
        instrumentId: selectedInstrumentId,
        trainingBars,
        evaluationBars,
        minimumSamples,
        startingEquity: 100_000,
      });
      setReplayResult(result);
      setMessage(
        result.statistics.overall.eligible
          ? 'Replay complete. Statistics include modeled execution costs.'
          : 'Replay complete. Metrics are withheld until the minimum sample size is reached.',
      );
    } catch {
      setMessage('Replay could not be completed with the available historical bars.');
    } finally {
      setRunningReplay(false);
    }
  }

  async function handleCreatePaperAccount() {
    const accessToken = session?.tokens.accessToken;
    if (!accessToken) return;
    setPaperWorking(true);
    try {
      const account = await createPaperAccount(accessToken);
      setPaperAccount(account);
      setPaperSnapshot(await fetchPaperSnapshot(accessToken, account.id));
      setMessage('PAPER account ready. No broker connection exists or can be invoked.');
    } catch {
      setMessage('Paper account could not be created.');
    } finally {
      setPaperWorking(false);
    }
  }

  async function handlePaperOrder() {
    const accessToken = session?.tokens.accessToken;
    const latestBar = bars.at(-1);
    if (!accessToken || !paperAccount || !latestBar || !paperConfirmed) return;
    setPaperWorking(true);
    try {
      const order = await submitPaperOrder(accessToken, paperAccount.id, {
        instrumentId: selectedInstrumentId,
        side: paperSide,
        quantity: paperQuantity,
        referencePrice: latestBar.close,
      });
      if (order.status !== 'rejected')
        await processPaperBar(accessToken, paperAccount.id, latestBar);
      setPaperSnapshot(await fetchPaperSnapshot(accessToken, paperAccount.id));
      setPaperConfirmed(false);
      setMessage(
        order.status === 'rejected'
          ? `PAPER order rejected: ${order.rejectionReason ?? 'risk limit'}.`
          : 'PAPER order processed with the pinned simulation model.',
      );
    } catch {
      setMessage('Paper order could not be processed.');
    } finally {
      setPaperWorking(false);
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
          <p className="eyebrow">Milestone 07</p>
          <h1 id="title">Forward paper workspace</h1>
          <p className="lede">
            Keep historical replay research separate while collecting simulated forward results
            through deterministic orders, fills, positions, ledger entries, and journal records.
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
                <dt>Current milestone</dt>
                <dd>Paper trading and journal</dd>
              </div>
            </dl>
            <section className="market-panel" aria-label="Market data preview">
              <div className="market-toolbar">
                <div>
                  <p className="eyebrow">Market data</p>
                  <h3>Sample 5m bars</h3>
                </div>
                <select
                  value={selectedInstrumentId}
                  onChange={(event) => setSelectedInstrumentId(event.target.value)}
                >
                  {instruments.map((instrument) => (
                    <option key={instrument.id} value={instrument.id}>
                      {instrument.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <p className="market-status">
                {marketStatus
                  ? `${marketStatus.status.toUpperCase()} | ${marketStatus.source} | gaps ${marketStatus.gap_count}`
                  : 'Checking market freshness'}
              </p>
              <div className="bars-table" role="table" aria-label="Recent bars">
                <div role="row">
                  <span role="columnheader">Time</span>
                  <span role="columnheader">Close</span>
                  <span role="columnheader">Volume</span>
                </div>
                {bars.map((bar) => (
                  <div role="row" key={bar.open_time}>
                    <span role="cell">{formatTime(bar.open_time)}</span>
                    <span role="cell">{bar.close.toLocaleString()}</span>
                    <span role="cell">{bar.volume.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="indicator-strip" aria-label="Indicators">
                {indicatorValues.map((indicator) => (
                  <div key={`${indicator.kind}-${indicator.period}`}>
                    <span>{indicator.kind.toUpperCase()}</span>
                    <strong>{indicator.value.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              {regime ? (
                <div className="regime-card" aria-label="Regime">
                  <span>REGIME</span>
                  <strong>
                    {regime.trend} / {regime.volatility}
                  </strong>
                  <p>{regime.reasons[0]}</p>
                </div>
              ) : null}
            </section>
            <section className="replay-panel" aria-label="Historical replay research">
              <div className="market-toolbar">
                <div>
                  <p className="eyebrow">Replay research</p>
                  <h3>Walk-forward backtest</h3>
                </div>
                <span className="origin-label">REPLAY</span>
              </div>
              <p className="market-status">
                Pinned data and versions · stop-first intrabar policy · fees, spread and slippage
              </p>
              <div className="replay-settings">
                <label>
                  Training bars
                  <input
                    type="number"
                    min="2"
                    value={trainingBars}
                    onChange={(event) => setTrainingBars(Number(event.target.value))}
                  />
                </label>
                <label>
                  Evaluation bars
                  <input
                    type="number"
                    min="1"
                    value={evaluationBars}
                    onChange={(event) => setEvaluationBars(Number(event.target.value))}
                  />
                </label>
                <label>
                  Minimum samples
                  <input
                    type="number"
                    min="1"
                    value={minimumSamples}
                    onChange={(event) => setMinimumSamples(Number(event.target.value))}
                  />
                </label>
              </div>
              <button
                className="button replay-button"
                type="button"
                disabled={isRunningReplay}
                onClick={() => void handleReplay()}
              >
                {isRunningReplay ? 'Running replay...' : 'Run historical replay'}
              </button>
              {replayResult ? <ReplayResults result={replayResult} /> : null}
            </section>
            <section className="replay-panel paper-panel" aria-label="Paper trading and journal">
              <div className="market-toolbar">
                <div>
                  <p className="eyebrow">Forward validation</p>
                  <h3>Simulation-only order ticket</h3>
                </div>
                <span className="origin-label origin-label--paper">PAPER</span>
              </div>
              <p className="market-status">
                No broker adapter · explicit confirmation · versioned fees, spread, slippage,
                latency and liquidity
              </p>
              {!paperAccount ? (
                <button
                  className="button"
                  type="button"
                  disabled={isPaperWorking}
                  onClick={() => void handleCreatePaperAccount()}
                >
                  {isPaperWorking ? 'Creating PAPER account...' : 'Create PAPER account'}
                </button>
              ) : (
                <>
                  <dl className="metrics-grid paper-summary">
                    <Metric label="Account" value={paperAccount.name} />
                    <Metric
                      label="Cash"
                      value={(
                        paperSnapshot?.accounts[0]?.cashBalance ?? paperAccount.cashBalance
                      ).toFixed(2)}
                    />
                    <Metric label="Origin" value="PAPER only" />
                  </dl>
                  <div className="replay-settings paper-ticket">
                    <label>
                      Side
                      <select
                        value={paperSide}
                        onChange={(event) => setPaperSide(event.target.value as 'buy' | 'sell')}
                      >
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={paperQuantity}
                        onChange={(event) => setPaperQuantity(Number(event.target.value))}
                      />
                    </label>
                    <label className="paper-confirm">
                      <input
                        type="checkbox"
                        checked={paperConfirmed}
                        onChange={(event) => setPaperConfirmed(event.target.checked)}
                      />
                      I confirm this simulated PAPER order
                    </label>
                  </div>
                  <button
                    className="button"
                    type="button"
                    disabled={isPaperWorking || !paperConfirmed}
                    onClick={() => void handlePaperOrder()}
                  >
                    {isPaperWorking
                      ? 'Processing PAPER order...'
                      : `Submit ${paperSide.toUpperCase()} PAPER order`}
                  </button>
                  <div className="paper-activity" aria-label="Paper positions and journal">
                    <p>
                      <strong>Positions</strong> {paperSnapshot?.positions.length ?? 0} ·{' '}
                      <strong>Fills</strong> {paperSnapshot?.fills.length ?? 0} ·{' '}
                      <strong>Journal</strong> {paperSnapshot?.journal.length ?? 0}
                    </p>
                    {paperSnapshot?.journal.slice(-3).map((trade) => (
                      <p key={trade.id}>
                        <span className="origin-label origin-label--paper">PAPER</span>{' '}
                        {trade.direction.toUpperCase()} {trade.quantity} {trade.instrumentId} ·{' '}
                        {trade.status}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </section>
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

function ReplayResults({ result }: Readonly<{ result: ReplayResearchResult }>) {
  const metrics = result.statistics.overall;
  return (
    <div className="replay-results" aria-label="Replay results">
      <div className="result-heading">
        <strong>
          {result.replay.status === 'completed' ? 'Replay complete' : result.replay.status}
        </strong>
        <span>{metrics.eligible ? 'Sample eligible' : 'More samples required'}</span>
      </div>
      <dl className="metrics-grid">
        <Metric label="Samples" value={String(metrics.sample_size)} />
        <Metric label="Coverage" value={formatPercent(result.statistics.coverage)} />
        <Metric label="Expectancy" value={formatRatio(metrics.expectancy_r, 'R')} />
        <Metric label="Profit factor" value={formatRatio(metrics.profit_factor)} />
        <Metric label="Max drawdown" value={formatPercent(metrics.maximum_drawdown_percent)} />
        <Metric label="Modeled costs" value={metrics.total_costs.toFixed(2)} />
      </dl>
      <p className="result-note">
        Execution {result.statistics.execution_version} · Statistics{' '}
        {result.statistics.definition_version} · {result.replay.result?.decision_count ?? 0}{' '}
        decisions
      </p>
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(value: number | undefined, suffix = ''): string {
  return value === undefined ? '—' : `${value.toFixed(2)}${suffix}`;
}
