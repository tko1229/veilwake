import { useCallback, useEffect, useRef, useState } from 'react';
import type { Telemetry } from './types';
import { ApiError, api } from './api';
import { Badge, Button, SectionHead } from './components';
import { formatCount, formatPercent, formatTimestamp, ratio } from './format';
import { IconAlert, IconGauge, IconRefresh } from './icons';

const CALL_TARGET = 1000;

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admincard">
      <p className="admincard__label">{label}</p>
      <p className="admincard__value">{value}</p>
      {sub ? <p className="admincard__sub">{sub}</p> : null}
    </div>
  );
}

/**
 * Engine room.
 *
 * Shows only what the telemetry endpoint actually reported. Fields that are
 * absent render as '?', and the call target is measured against observed
 * requests — never against an estimate presented as a count. Refreshing is
 * manual; there is no polling.
 */
export function AdminView({ onBack }: { onBack: () => void }) {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [token, setToken] = useState('');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (bearer?: string) => {
    setLoading(true);
    setFailure(null);
    try {
      const data = await api.telemetry(bearer);
      if (!mounted.current) return;
      setTelemetry(data);
      setNeedsToken(false);
      setLoadedAt(new Date().toISOString());
    } catch (cause) {
      if (!mounted.current) return;
      const error = cause instanceof ApiError ? cause : new ApiError('Unexpected failure.', 'unknown', 0);
      setTelemetry(null);
      setNeedsToken(error.isUnauthorized);
      setFailure(error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requests = telemetry?.requests ?? null;
  const targetPct = Math.round(ratio(requests, CALL_TARGET) * 100);
  const endpointRows = telemetry ? Object.entries(telemetry.endpoints ?? {}) : [];
  const recentRows = telemetry?.recent ?? [];
  const failures = recentRows.filter((entry) => entry.status >= 400);

  return (
    <div className="admin">
      <header className="admin__head">
        <div>
          <p className="stagecard__kicker">Engine room</p>
          <h1 style={{ fontSize: 'var(--step-3)', marginTop: 6 }}>Upstream telemetry</h1>
          <p className="honestnote" style={{ marginTop: 8 }}>
            Every figure below is reported by <span className="mono">/api/admin/telemetry</span>. Nothing is estimated
            for display, and no count is invented to look busier. Refreshing is manual — this view never polls.
          </p>
        </div>
        <div className="admin__head-right">
          <Button variant="ghost" onClick={() => void load(token || undefined)} disabled={loading} icon={<IconRefresh size={16} />}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            Back to the game
          </Button>
        </div>
      </header>

      {needsToken ? (
        <section className="surface startblock" aria-labelledby="admin-token-title">
          <SectionHead title="Bearer token required" id="admin-token-title" note="memory only · never saved" />
          <p style={{ color: 'var(--forest-2)' }}>
            This telemetry endpoint is not open on this host. Supply the <span className="mono">ADMIN_TOKEN</span> to
            read it. The token is held in memory for this page only; it is never written to storage.
          </p>
          <form
            className="tokenrow"
            style={{ marginTop: 14 }}
            onSubmit={(event) => {
              event.preventDefault();
              void load(token);
            }}
          >
            <label className="field">
              <span className="field__label">Admin bearer token</span>
              <input
                className="input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="paste ADMIN_TOKEN"
              />
            </label>
            <Button variant="primary" type="submit" disabled={loading || token.length === 0}>
              Unlock telemetry
            </Button>
          </form>
        </section>
      ) : null}

      {failure && !needsToken ? (
        <section className="surface startblock" role="alert">
          <p className="stagecard__kicker">
            <IconAlert size={13} /> Telemetry unavailable
          </p>
          <p style={{ marginTop: 8, color: 'var(--forest-2)' }}>{failure.message}</p>
          <div className="errdetail">
            <div className="errdetail__row">
              <span className="errdetail__k">code</span>
              <span>{failure.code}</span>
            </div>
            <div className="errdetail__row">
              <span className="errdetail__k">status</span>
              <span>{failure.status}</span>
            </div>
          </div>
          <div className="stagecard__actions">
            <Button variant="primary" onClick={() => void load(token || undefined)} icon={<IconRefresh size={16} />}>
              Try again
            </Button>
          </div>
        </section>
      ) : null}

      {loading && !telemetry ? (
        <section className="surface startblock" aria-busy="true">
          <p className="stagecard__kicker">Reading the meter</p>
          <p style={{ marginTop: 8, color: 'var(--forest-2)' }}>Asking the server for its telemetry…</p>
        </section>
      ) : null}

      {telemetry ? (
        <>
          <section aria-labelledby="admin-target-title">
            <SectionHead
              title="Call target"
              id="admin-target-title"
              note={`measured against observed requests · read at ${formatTimestamp(loadedAt)}`}
            />
            <div className="admincard">
              <p className="admincard__label">Observed requests toward the {CALL_TARGET}-call target</p>
              <p className="admincard__value">
                {formatCount(requests)} <span style={{ fontSize: 'var(--step-1)' }}>/ {CALL_TARGET}</span>
              </p>
              <div className="target">
                <div
                  className="target__track"
                  role="progressbar"
                  aria-label={`Observed requests toward ${CALL_TARGET}`}
                  aria-valuenow={requests ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={CALL_TARGET}
                  aria-valuetext={`${formatCount(requests)} of ${CALL_TARGET}`}
                >
                  <div className="target__fill" style={{ width: `${targetPct}%` }} />
                </div>
              </div>
              <p className="admincard__sub">
                {targetPct}% of the target. Estimated credits are tracked separately and are never added to this count.
              </p>
            </div>
          </section>

          <section aria-labelledby="admin-counts-title">
            <SectionHead title="Counts" id="admin-counts-title" note="as reported by the server" />
            <div className="admingrid">
              <Card label="Requests" value={formatCount(telemetry.requests)} />
              <Card label="Successes" value={formatCount(telemetry.successes)} sub={formatPercent(telemetry.successes, telemetry.requests) + ' of requests'} />
              <Card label="Failures" value={formatCount(telemetry.failures)} />
              <Card label="Cache hits" value={formatCount(telemetry.cacheHits)} />
              <Card label="Deduplicated" value={formatCount(telemetry.deduplicated)} />
              <Card label="Events processed" value={formatCount(telemetry.eventsProcessed)} />
              <Card label="Credits used" value={formatCount(telemetry.creditsUsed)} />
              <Card
                label="Credits estimated"
                value={formatCount(telemetry.creditsEstimated)}
                sub="estimate only, not a reported figure"
              />
              <Card
                label="Credits remaining"
                value={telemetry.creditsRemaining === null ? '?' : formatCount(telemetry.creditsRemaining)}
                sub={telemetry.creditsRemaining === null ? 'upstream did not report this' : undefined}
              />
              <Card label="Started at" value={formatTimestamp(telemetry.startedAt)} />
            </div>
          </section>

          <section aria-labelledby="admin-budget-title">
            <SectionHead title="Read budget" id="admin-budget-title" note="hour and day windows" />
            <div className="admingrid">
              <Card
                label="This hour"
                value={`${formatCount(telemetry.hourUsed)} / ${formatCount(telemetry.hourLimit)}`}
                sub={formatPercent(telemetry.hourUsed, telemetry.hourLimit) + ' of the hourly cap'}
              />
              <Card
                label="Today"
                value={`${formatCount(telemetry.dayUsed)} / ${formatCount(telemetry.dayLimit)}`}
                sub={formatPercent(telemetry.dayUsed, telemetry.dayLimit) + ' of the daily cap'}
              />
              <Card label="Chains touched" value={formatCount(telemetry.chains?.length ?? null)} sub={(telemetry.chains ?? []).join(', ') || 'none reported'} />
            </div>
          </section>

          <section aria-labelledby="admin-endpoints-title">
            <SectionHead title="Endpoints" id="admin-endpoints-title" note={`${endpointRows.length} reported`} />
            {endpointRows.length > 0 ? (
              <div className="tablewrap">
                <table className="data">
                  <caption>Per-endpoint request outcomes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Endpoint</th>
                      <th scope="col">Requests</th>
                      <th scope="col">Successes</th>
                      <th scope="col">Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpointRows.map(([endpoint, stats]) => (
                      <tr key={endpoint}>
                        <td className="wrap">{endpoint}</td>
                        <td>{formatCount(stats?.requests ?? null)}</td>
                        <td>{formatCount(stats?.successes ?? null)}</td>
                        <td>{formatCount(stats?.failures ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="honestnote">No endpoint has been called yet in this process.</p>
            )}
          </section>

          <section aria-labelledby="admin-recent-title">
            <SectionHead
              title="Recent reads"
              id="admin-recent-title"
              note={`${recentRows.length} held · ${failures.length} with an error status`}
            />
            {recentRows.length > 0 ? (
              <div className="tablewrap">
                <table className="data">
                  <caption>Most recent upstream reads, newest first</caption>
                  <thead>
                    <tr>
                      <th scope="col">At</th>
                      <th scope="col">Endpoint</th>
                      <th scope="col">Status</th>
                      <th scope="col">Request id</th>
                      <th scope="col">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRows.map((entry, index) => (
                      <tr key={`${entry.at}-${index}`}>
                        <td>{formatTimestamp(entry.at)}</td>
                        <td className="wrap">{entry.endpoint}</td>
                        <td>
                          {entry.status} {entry.status >= 400 ? <Badge tone="warn">error</Badge> : null}
                        </td>
                        <td>{entry.requestId ? entry.requestId : '?'}</td>
                        <td>{entry.credits === null || entry.credits === undefined ? '?' : formatCount(entry.credits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="honestnote">No upstream read has been recorded yet.</p>
            )}
          </section>

          <p className="honestnote">
            <IconGauge size={14} /> Cache hits and deduplicated calls are shown because they change how many upstream
            calls a session really costs. They are counted separately from requests and are never folded into the
            target.
          </p>
        </>
      ) : null}
    </div>
  );
}
