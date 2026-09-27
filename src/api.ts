import type { AlertPlan, ApiFailure, CallChoice, Doctrine, GameState, IntelToolId, Mode, Plans, Telemetry } from './types';

/**
 * Structured failure surface for every call.
 *
 * The engine answers errors as `{error, code, retryAfter?, canDemo?}`. Anything
 * that is not JSON, or not shaped that way, is normalised into the same shape so
 * the UI never has to branch on transport weirdness.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  readonly canDemo?: boolean;

  constructor(message: string, code: string, status: number, extra?: { retryAfter?: number; canDemo?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = extra?.retryAfter;
    this.canDemo = extra?.canDemo;
  }

  /** True when the run is gone server-side and cannot be resumed. */
  get isExpired(): boolean {
    // Codes only: an upstream 404 (Nansen) arrives as 502 `upstream_not_found`
    // and must never throw away a live voyage that is still afloat.
    return this.code === 'not_found' || this.code === 'expired';
  }

  /** True when our view of the game is stale and a refetch would help. */
  get isConflict(): boolean {
    return this.status === 409 || this.code === 'revision_conflict';
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === 'rate_limited';
  }
}

function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object' && value !== null && typeof (value as ApiFailure).error === 'string';
}

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const { token, headers, ...rest } = init ?? {};
  let response: Response;

  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        accept: 'application/json',
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'unknown transport failure';
    throw new ApiError(
      `Could not reach the game server. ${detail}`,
      'network_unreachable',
      0,
    );
  }

  const text = await response.text().catch(() => '');
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (isApiFailure(parsed)) {
      throw new ApiError(parsed.error, parsed.code || 'unknown_error', response.status, {
        retryAfter: parsed.retryAfter,
        canDemo: parsed.canDemo,
      });
    }
    throw new ApiError(
      `The server answered ${response.status} without a readable reason.`,
      'malformed_error',
      response.status,
    );
  }

  if (parsed === null) {
    throw new ApiError('The server returned an empty body where data was expected.', 'empty_body', response.status);
  }

  return parsed as T;
}

export const api = {
  /** Cheap capability probe. Never blocks play; failures are advisory. */
  health(): Promise<{ ok: boolean; keyConfigured: boolean }> {
    return request<{ ok: boolean; keyConfigured: boolean }>('/api/health');
  },

  createGame(mode: Mode, doctrine: Doctrine): Promise<GameState> {
    return request<GameState>('/api/game', {
      method: 'POST',
      body: JSON.stringify({ mode, doctrine }),
    });
  },

  getGame(id: string): Promise<GameState> {
    return request<GameState>(`/api/game/${encodeURIComponent(id)}`);
  },

  scout(id: string, laneId: string, revision: number): Promise<GameState> {
    return request<GameState>(`/api/game/${encodeURIComponent(id)}/scout`, {
      method: 'POST',
      body: JSON.stringify({ laneId, revision }),
    });
  },

  investigate(id: string, laneId: string, tool: IntelToolId, revision: number): Promise<GameState> {
    return request<GameState>(`/api/game/${encodeURIComponent(id)}/investigate`, {
      method: 'POST',
      body: JSON.stringify({ laneId, tool, revision }),
    });
  },

  resolve(
    id: string,
    plans: Plans,
    revision: number,
    extras: { alert: AlertPlan | null; calls: Record<string, CallChoice> } = { alert: null, calls: {} },
  ): Promise<GameState> {
    return request<GameState>(`/api/game/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ plans, revision, alert: extras.alert, calls: extras.calls }),
    });
  },

  next(id: string, revision: number): Promise<GameState> {
    return request<GameState>(`/api/game/${encodeURIComponent(id)}/next`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    });
  },

  /** Same-origin redirect to the token's public Token God Mode page. */
  nansenHref(id: string, wave: number, laneId: string): string {
    return `/api/game/${encodeURIComponent(id)}/nansen/${wave}/${encodeURIComponent(laneId)}`;
  },

  async telemetry(token?: string): Promise<Telemetry> {
    const result = await request<{telemetry:Telemetry}>('/api/admin/telemetry', { token });
    return result.telemetry;
  },
};

/** Human-readable, non-alarming rendering of a failure for the UI. */
export function describeFailure(error: ApiError, mode: Mode): { title: string; body: string; detail: string } {
  if (error.isExpired) {
    return {
      title: 'That run has expired',
      body: 'The lockwork closed this session. Nothing is lost — start a fresh run whenever you are ready.',
      detail: `code ${error.code} · status ${error.status}`,
    };
  }
  if (error.isConflict) {
    return {
      title: 'The board moved under you',
      body: 'Another change landed first. Reload the current state and try again.',
      detail: `code ${error.code} · status ${error.status}`,
    };
  }
  if (error.code === 'server_rate_limited') {
    return {
      title: 'Too many clicks in a minute',
      body: 'This game server paces requests per player. Wait a minute, then carry on. No Nansen calls were spent.',
      detail: `code ${error.code} · status ${error.status}`,
    };
  }
  if (error.isRateLimited) {
    const wait = error.retryAfter ? ` Try again in about ${error.retryAfter}s.` : ' Try again shortly.';
    return {
      title: 'Upstream read budget is spent',
      body: `The Nansen call budget for this window is used up.${wait}`,
      detail: `code ${error.code} · status ${error.status}`,
    };
  }
  if (error.status === 0) {
    return {
      title: 'No answer from the game server',
      body: 'The page could not reach its own backend. Check that the server is running, then retry.',
      detail: `code ${error.code}`,
    };
  }
  if (mode === 'live' && error.canDemo) {
    return {
      title: 'Live data is unavailable right now',
      body: 'The live current could not be read. You can retry, or switch deliberately to the rehearsal.',
      detail: `code ${error.code} · status ${error.status}`,
    };
  }
  return {
    title: 'That action did not complete',
    body: error.message,
    detail: `code ${error.code} · status ${error.status}`,
  };
}
