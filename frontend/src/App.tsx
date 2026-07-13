import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchApiHealth,
  fetchIndicators,
  fetchInstruments,
  fetchMarketBars,
  fetchMarketStatus,
  fetchMe,
  fetchRegime,
  fetchLatestDecision,
  fetchHistoricalMemory,
  login,
  logout,
  registerAccount,
  runHistoricalReplay,
  createPaperAccount,
  submitPaperOrder,
  processPaperBar,
  fetchPaperSnapshot,
  updatePaperJournal,
  resetPaperAccount,
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
  type ExplainableDecision,
  type HistoricalMemoryResult,
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
  const [decision, setDecision] = useState<ExplainableDecision | undefined>();
  const [dataState, setDataState] = useState<
    'loading' | 'ready' | 'empty' | 'error' | 'reconnecting'
  >('loading');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [journalNotes, setJournalNotes] = useState('');
  const [journalTags, setJournalTags] = useState('');
  const [historicalMemory, setHistoricalMemory] = useState<HistoricalMemoryResult | undefined>();

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
    let active = true;
    setDataState(refreshVersion > 0 ? 'reconnecting' : 'loading');
    void Promise.all([
      fetchMarketBars(selectedInstrumentId),
      fetchMarketStatus(selectedInstrumentId),
      fetchIndicators(selectedInstrumentId),
      fetchRegime(selectedInstrumentId),
    ])
      .then(async ([nextBars, nextStatus, nextIndicators, nextRegime]) => {
        if (!active) return;
        setBars(nextBars);
        setMarketStatus(nextStatus);
        setIndicatorValues(nextIndicators);
        setRegime(nextRegime);
        setDecision(undefined);
        if (nextBars.length === 0) {
          setDataState('empty');
          return;
        }
        try {
          const nextDecision = await fetchLatestDecision(
            session.tokens.accessToken,
            selectedInstrumentId,
            nextBars.at(-1)!.received_at,
          );
          if (active) setDecision(nextDecision);
        } catch {
          if (active) setMessage('Decision evidence is partially unavailable.');
        }
        if (active) setDataState('ready');
      })
      .catch(() => {
        if (active) {
          setDataState('error');
          setMessage('Market data is not available yet.');
        }
      });
    return () => {
      active = false;
    };
  }, [session, selectedInstrumentId, refreshVersion]);

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
      const latestBar = bars.at(-1);
      if (latestBar) {
        try {
          setHistoricalMemory(
            await fetchHistoricalMemory(
              accessToken,
              selectedInstrumentId,
              latestBar.received_at,
              decision?.score ?? 0,
            ),
          );
        } catch {
          setHistoricalMemory(undefined);
        }
      }
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

  async function handleJournalSave(tradeId: string) {
    const token = session?.tokens.accessToken;
    if (!token || !paperAccount) return;
    setPaperWorking(true);
    try {
      await updatePaperJournal(token, paperAccount.id, tradeId, {
        notes: journalNotes,
        tags: journalTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setPaperSnapshot(await fetchPaperSnapshot(token, paperAccount.id));
      setMessage('PAPER journal notes and tags saved with audit history.');
    } catch {
      setMessage('Journal update could not be saved.');
    } finally {
      setPaperWorking(false);
    }
  }

  async function handlePaperReset() {
    const token = session?.tokens.accessToken;
    if (
      !token ||
      !paperAccount ||
      !window.confirm('Reset this PAPER account version? History will be retained.')
    )
      return;
    setPaperWorking(true);
    try {
      await resetPaperAccount(token, paperAccount.id);
      setPaperSnapshot(await fetchPaperSnapshot(token, paperAccount.id));
      setMessage('PAPER account version reset; prior history remains available.');
    } catch {
      setMessage('PAPER account could not be reset.');
    } finally {
      setPaperWorking(false);
    }
  }

  return (
    <main>
      <a className="skip-link" href="#dashboard-content">
        Skip to dashboard content
      </a>
      <header>
        <a className="brand" href="/" aria-label="TradeAt home">
          TRADE<span>AT</span>
        </a>
        <span className={`status status--${health.state}`} role="status">
          <i aria-hidden="true" />
          {labels[health.state]}
        </span>
      </header>

      <section
        className={session ? 'workspace workspace--dashboard' : 'workspace'}
        aria-labelledby="title"
      >
        <div className="intro">
          <p className="eyebrow">Milestone 08</p>
          <h1 id="title">TradeAt MVP dashboard</h1>
          <p className="lede">
            One evidence-first workspace for market state, explainable decisions, replay research,
            PAPER execution, journal records, and honest analytics.
          </p>
        </div>

        {session ? (
          <section
            className="panel dashboard-shell"
            id="dashboard-content"
            aria-label="Signed in workspace"
          >
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
                <dd>Unified MVP dashboard</dd>
              </div>
            </dl>
            <div
              className={`surface-state surface-state--${dataState}`}
              role="status"
              aria-live="polite"
            >
              {dataState === 'loading' ? 'Loading bounded market context…' : null}
              {dataState === 'reconnecting'
                ? 'Reconnecting and resynchronizing market context…'
                : null}
              {dataState === 'empty' ? 'No closed bars are available for this instrument.' : null}
              {dataState === 'error'
                ? 'Market context failed to load. Previously shown data is not presented as live.'
                : null}
              {dataState === 'ready'
                ? `${marketStatus?.status.toUpperCase() ?? 'UNKNOWN'} market context loaded.`
                : null}
              {dataState === 'error' || marketStatus?.gap_count ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRefreshVersion((value) => value + 1)}
                >
                  Reconnect and resync
                </button>
              ) : null}
            </div>
            <p className="message" aria-live="polite">
              {message}
            </p>
            <nav className="watchlist" aria-label="Instrument watchlist">
              {instruments.length ? (
                instruments.map((instrument) => (
                  <button
                    key={instrument.id}
                    type="button"
                    aria-current={selectedInstrumentId === instrument.id ? 'true' : undefined}
                    onClick={() => setSelectedInstrumentId(instrument.id)}
                  >
                    <span>{instrument.symbol}</span>
                    <small>
                      {instrument.venue} · {instrument.currency}
                    </small>
                  </button>
                ))
              ) : (
                <p>No watchlist instruments yet.</p>
              )}
            </nav>
            <div className="dashboard-grid">
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
                <PriceChart bars={bars} status={marketStatus?.status} />
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
              <DecisionCard
                decision={decision}
                regime={regime}
                dataState={dataState}
                onPrefill={(side) => {
                  setPaperSide(side);
                  setMessage(
                    'Decision direction copied to the PAPER ticket. Review and confirm before submission.',
                  );
                }}
              />
            </div>
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
                    <Metric
                      label="Starting capital"
                      value={`${paperAccount.startingBalance.toFixed(2)} ${paperAccount.currency}`}
                    />
                    <Metric
                      label="Cash"
                      value={(
                        paperSnapshot?.accounts[0]?.cashBalance ?? paperAccount.cashBalance
                      ).toFixed(2)}
                    />
                    <Metric
                      label="Equity"
                      value={(paperSnapshot?.accounts[0]?.equity ?? paperAccount.equity).toFixed(2)}
                    />
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
                    {paperSnapshot?.positions.map((position) => (
                      <p key={position.instrumentId}>
                        <strong>{position.instrumentId}</strong> · qty {position.quantity} · avg{' '}
                        {position.averagePrice.toFixed(2)} · P&amp;L{' '}
                        {position.realizedPnl.toFixed(2)}
                      </p>
                    ))}
                    {paperSnapshot?.journal.at(-1) ? (
                      <form
                        className="journal-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleJournalSave(paperSnapshot.journal.at(-1)!.id);
                        }}
                      >
                        <label>
                          Journal notes
                          <textarea
                            value={journalNotes}
                            onChange={(event) => setJournalNotes(event.target.value)}
                            placeholder="What did the evidence show?"
                          />
                        </label>
                        <label>
                          Tags
                          <input
                            value={journalTags}
                            onChange={(event) => setJournalTags(event.target.value)}
                            placeholder="breakout, disciplined"
                          />
                        </label>
                        <button className="button" type="submit" disabled={isPaperWorking}>
                          Save journal entry
                        </button>
                      </form>
                    ) : null}
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={isPaperWorking || paperSnapshot?.accounts[0]?.status === 'reset'}
                      onClick={() => void handlePaperReset()}
                    >
                      Reset PAPER account version
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="replay-panel analytics-panel" aria-label="Core analytics">
              <div className="market-toolbar">
                <div>
                  <p className="eyebrow">Analytics</p>
                  <h3>Result integrity</h3>
                </div>
                <span className="origin-label">SAMPLES FIRST</span>
              </div>
              <dl className="metrics-grid">
                <Metric
                  label="Replay samples"
                  value={String(replayResult?.statistics.overall.sample_size ?? 0)}
                />
                <Metric label="Paper trades" value={String(paperSnapshot?.journal.length ?? 0)} />
                <Metric label="Paper fills" value={String(paperSnapshot?.fills.length ?? 0)} />
                <Metric
                  label="Replay expectancy"
                  value={formatRatio(replayResult?.statistics.overall.expectancy_r, 'R')}
                />
                <Metric
                  label="Replay drawdown"
                  value={
                    replayResult
                      ? formatPercent(replayResult.statistics.overall.maximum_drawdown_percent)
                      : '—'
                  }
                />
                <Metric
                  label="Replay costs"
                  value={
                    replayResult ? replayResult.statistics.overall.total_costs.toFixed(2) : '—'
                  }
                />
              </dl>
              <p className="result-note">
                REPLAY and PAPER origins remain separate. No metric implies guaranteed or
                brokerage-realized returns.
              </p>
            </section>
            <section className="replay-panel memory-panel" aria-label="Historical memory">
              <div className="market-toolbar">
                <div>
                  <p className="eyebrow">Historical memory</p>
                  <h3>Comparable point-in-time setups</h3>
                </div>
                <span className="origin-label">VERSION MATCHED</span>
              </div>
              {!historicalMemory ? (
                <p className="market-status">
                  Run a replay to populate reproducible prior setup memories.
                </p>
              ) : (
                <>
                  <p className="market-status">
                    {historicalMemory.cohort.sampleSize} comparable snapshots ·{' '}
                    {historicalMemory.cohort.outcomes} known outcomes · definition{' '}
                    {historicalMemory.definition_version}
                  </p>
                  <dl className="metrics-grid">
                    <Metric
                      label="Cohort size"
                      value={String(historicalMemory.cohort.sampleSize)}
                    />
                    <Metric
                      label="Mean outcome"
                      value={formatRatio(historicalMemory.cohort.meanReturnR, 'R')}
                    />
                    <Metric
                      label="Uncertainty"
                      value={
                        historicalMemory.cohort.confidence95
                          ? `${historicalMemory.cohort.confidence95[0].toFixed(2)}–${historicalMemory.cohort.confidence95[1].toFixed(2)}R`
                          : 'More outcomes required'
                      }
                    />
                  </dl>
                  <ol className="memory-list">
                    {historicalMemory.matches.map((match) => (
                      <li key={match.snapshot.id}>
                        <strong>{match.snapshot.setup_id}</strong>
                        <span>
                          {match.snapshot.regime} · distance {match.distance.toFixed(4)}
                        </span>
                        <span>
                          {match.snapshot.outcome
                            ? `${match.snapshot.outcome.returnR.toFixed(2)}R`
                            : 'Outcome unavailable at query time'}
                        </span>
                        <small>
                          {match.snapshot.provenance.source.toUpperCase()} ·{' '}
                          {match.snapshot.versions.decision}
                        </small>
                      </li>
                    ))}
                  </ol>
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

function PriceChart({
  bars,
  status,
}: Readonly<{ bars: readonly MarketBar[]; status: MarketStatus['status'] | undefined }>) {
  if (!bars.length) return <div className="empty-chart">No chart data available.</div>;
  const closes = bars.map((bar) => bar.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = closes
    .map(
      (close, index) =>
        `${(index / Math.max(1, closes.length - 1)) * 100},${42 - ((close - min) / span) * 34}`,
    )
    .join(' ');
  return (
    <figure className="price-chart">
      <svg
        viewBox="0 0 100 48"
        role="img"
        aria-labelledby="price-chart-title price-chart-description"
        preserveAspectRatio="none"
      >
        <title id="price-chart-title">Recent closing prices</title>
        <desc id="price-chart-description">
          {bars.length} bounded five-minute bars from {min.toFixed(2)} to {max.toFixed(2)}. Data
          status is {status ?? 'unknown'}.
        </desc>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption>
        {bars.length} bars · low {min.toFixed(2)} · high {max.toFixed(2)} ·{' '}
        {status === 'fresh' ? 'LIVE-ELIGIBLE' : 'DELAYED / STALE'}
      </figcaption>
    </figure>
  );
}

function DecisionCard({
  decision,
  regime,
  dataState,
  onPrefill,
}: Readonly<{
  decision: ExplainableDecision | undefined;
  regime: RegimeClassification | undefined;
  dataState: string;
  onPrefill(side: 'buy' | 'sell'): void;
}>) {
  return (
    <section className="decision-card" aria-label="Explainable decision">
      <div className="market-toolbar">
        <div>
          <p className="eyebrow">Decision</p>
          <h3>Explainable point-in-time output</h3>
        </div>
        <span
          className={`decision-direction decision-direction--${decision?.direction ?? 'pending'}`}
        >
          {decision?.direction.toUpperCase() ?? 'PENDING'}
        </span>
      </div>
      {!decision ? (
        <p className="market-status">
          {dataState === 'ready'
            ? 'Decision evidence is partially unavailable.'
            : 'Waiting for bounded market evidence…'}
        </p>
      ) : (
        <>
          <dl className="decision-summary">
            <Metric label="Score" value={decision.score.toFixed(2)} />
            <Metric label="Confidence" value={formatPercent(decision.confidence)} />
            <Metric
              label="Regime"
              value={`${regime?.trend ?? 'unknown'} / ${regime?.volatility ?? 'unknown'}`}
            />
          </dl>
          <p className="decision-time">
            Evaluated {formatDate(decision.evaluated_at)} · policy {decision.policy_version}
          </p>
          {decision.vetoes.length ? (
            <div className="decision-veto" role="note">
              <strong>Action withheld</strong>
              {decision.vetoes.map((veto) => (
                <p key={veto.code}>{veto.message}</p>
              ))}
            </div>
          ) : null}
          <details>
            <summary>Evidence and gate details</summary>
            <ol className="gate-list">
              {decision.gates.map((gate) => (
                <li key={gate.gate}>
                  <span>{gate.gate.replace('_', ' ')}</span>
                  <strong>{gate.status}</strong>
                  <p>{gate.reasons[0]}</p>
                </li>
              ))}
            </ol>
            <code className="repro-id">
              {decision.id}:{decision.policy_hash.slice(0, 12)}
            </code>
          </details>
          {decision.direction !== 'abstain' ? (
            <button
              className="button"
              type="button"
              onClick={() => onPrefill(decision.direction === 'long' ? 'buy' : 'sell')}
            >
              Prefill PAPER ticket
            </button>
          ) : null}
        </>
      )}
    </section>
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
