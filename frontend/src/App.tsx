import { useEffect, useState } from 'react';
import { fetchApiHealth, type ApiHealth } from './api';
import './styles.css';

const labels = {
  checking: 'Checking platform',
  ready: 'Platform ready',
  degraded: 'Dependencies degraded',
  unreachable: 'API unreachable',
} as const;

export function App() {
  const [health, setHealth] = useState<ApiHealth | { state: 'checking' }>({ state: 'checking' });
  useEffect(() => {
    const controller = new AbortController();
    void fetchApiHealth(controller.signal).then(setHealth);
    return () => controller.abort();
  }, []);
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
      <section className="hero" aria-labelledby="title">
        <p className="eyebrow">Decision intelligence, built on evidence</p>
        <h1 id="title">
          Market context you can
          <br />
          <em>inspect and replay.</em>
        </h1>
        <p className="lede">
          The platform foundation is online. Live analysis, explainable decisions, journaling, and
          deterministic replay arrive milestone by milestone.
        </p>
      </section>
      <section className="foundation" aria-labelledby="foundation-title">
        <div>
          <p className="eyebrow">Milestone 01</p>
          <h2 id="foundation-title">Platform foundation</h2>
        </div>
        <dl>
          <div>
            <dt>API</dt>
            <dd>Fastify + TypeScript</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>PostgreSQL</dd>
          </div>
          <div>
            <dt>Coordination</dt>
            <dd>Redis</dd>
          </div>
          <div>
            <dt>Observability</dt>
            <dd>Structured + trace-ready</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
