/**
 * Fano Classifier HTTP client.
 *
 * Thin wrapper over POST /ingest/trial_balance with:
 * - X-API-Key authentication
 * - Equilibrium-sentinel pattern for single-line probes
 * - Structured error handling (HTTP 400 equilibrium / 502 substrate / 5xx)
 * - Schema-version selection (canonical vs legacy current-production)
 *
 * **Schema selection**: by default the client targets the **legacy**
 * current-production response shape and applies `LegacyResponseAdapter`
 * to return canonical `TrialBalanceResponse`. Once OT #103 deploys, switch
 * `schemaVersion` to `'canonical'` to skip the adapter step.
 */

import type {
  LineItem,
  LegacyTrialBalanceResponse,
  TrialBalancePayload,
  TrialBalanceResponse,
  SbrmCode,
  Topology,
} from './types.js';
import { adaptLegacyResponse } from './adapter.js';

/** Default Fano production base URL. */
export const DEFAULT_BASE_URL = 'https://fano-engine-afmurhqkaq-ts.a.run.app';

/** Schema version targeted by the client. */
export type SchemaVersion = 'legacy' | 'canonical';

export interface FanoClientConfig {
  /** Production endpoint base URL (without trailing slash). */
  baseUrl?: string;
  /** X-API-Key header value (obtain from LodgeiT Labs onboarding). */
  apiKey: string;
  /**
   * Schema version. Defaults to `'legacy'` (current-production cascade-
   * authoritative shape; adapter applied automatically to return canonical).
   * Switch to `'canonical'` once production has migrated to OT #103.
   */
  schemaVersion?: SchemaVersion;
  /** Optional fetch implementation override (for testing / Node 18+). */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
}

/**
 * Structured error from the Fano API.
 *
 * Surfaces equilibrium violations (HTTP 400), substrate inconsistencies
 * (HTTP 502 with `detail: 'Cascade substrate inconsistency'`), and
 * generic 4xx/5xx failures.
 */
export class FanoApiError extends Error {
  public readonly httpStatus: number;
  public readonly detail: string;

  constructor(httpStatus: number, detail: string, message?: string) {
    super(message ?? `Fano API ${httpStatus}: ${detail}`);
    this.name = 'FanoApiError';
    this.httpStatus = httpStatus;
    this.detail = detail;
  }
}

/**
 * Equilibrium-balancing sentinel line.
 *
 * Production /ingest/trial_balance enforces `abs(sum(lines.amount)) <= 0.01`.
 * For single-line probes, generate a sentinel using the row's primary
 * topology to produce a structurally-legal contra entry. The sentinel is
 * never scored at the consumer level; consumers inspect `results[0]` only.
 */
export function buildEquilibriumSentinel(
  primary: LineItem,
): LineItem {
  const isAssetSide = ['current_assets', 'non_current_assets', 'expenses'].includes(
    primary.source_topology,
  );
  const contraTopology: Topology = isAssetSide
    ? 'current_liabilities'
    : 'current_assets';
  const contraCode: SbrmCode = isAssetSide ? 'sbrm_2266' : 'sbrm_1137';

  return {
    description: 'Probe Sentinel Balancing Line (NOT SCORED)',
    predicted_code: contraCode,
    source_topology: contraTopology,
    confidence: 0.99,
    amount: Math.round(-primary.amount * 100) / 100,
  };
}

/**
 * Wrap a single line item in a balanced trial-balance payload using the
 * equilibrium-sentinel pattern. Use for single-line probes.
 *
 * @example
 * const payload = wrapSingleLineProbe({
 *   description: 'Trading Revenue',
 *   predicted_code: 'sbrm_4100',
 *   source_topology: 'revenue',
 *   confidence: 0.95,
 *   amount: 1000.00,
 * }, 'company');
 */
export function wrapSingleLineProbe(
  primary: LineItem,
  entityStructure: TrialBalancePayload['entity_structure'],
): TrialBalancePayload {
  return {
    entity_structure: entityStructure,
    lines: [primary, buildEquilibriumSentinel(primary)],
  };
}

/**
 * Type guard for the legacy response shape.
 *
 * Detects whether a response is in the current-production (cascade-
 * authoritative) shape by checking for the `operator_hint_predicted_code`
 * field which is present only in legacy responses.
 */
export function isLegacyResponse(
  raw: unknown,
): raw is LegacyTrialBalanceResponse {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as { results?: unknown };
  if (!Array.isArray(obj.results) || obj.results.length === 0) return false;
  const first = obj.results[0] as Record<string, unknown>;
  return (
    'operator_hint_predicted_code' in first &&
    'cascade_topology' in first &&
    !('cascade' in first)
  );
}

/** Type guard for the canonical (post-OT-#103) response shape. */
export function isCanonicalResponse(
  raw: unknown,
): raw is TrialBalanceResponse {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as { results?: unknown };
  if (!Array.isArray(obj.results) || obj.results.length === 0) return false;
  const first = obj.results[0] as Record<string, unknown>;
  return 'cascade' in first && 'warnings' in first;
}

// ============================================================================
// Client class
// ============================================================================

export class FanoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly schemaVersion: SchemaVersion;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: FanoClientConfig) {
    if (!config.apiKey) {
      throw new Error('FanoClient: apiKey is required');
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.schemaVersion = config.schemaVersion ?? 'legacy';
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = config.timeoutMs ?? 30000;
    if (!this.fetchImpl) {
      throw new Error(
        'FanoClient: fetch is not available; provide fetchImpl in config (Node < 18)',
      );
    }
  }

  /**
   * POST /ingest/trial_balance with the supplied payload.
   *
   * Returns the canonical response shape regardless of `schemaVersion`
   * (legacy responses are transformed via `adaptLegacyResponse`).
   *
   * @throws {FanoApiError} on HTTP non-200
   */
  async ingestTrialBalance(
    payload: TrialBalancePayload,
  ): Promise<TrialBalanceResponse> {
    const url = `${this.baseUrl}/ingest/trial_balance`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as { detail?: string };
        if (errorBody.detail) detail = errorBody.detail;
      } catch {
        // Body wasn't JSON — fall through with HTTP status only
      }
      throw new FanoApiError(response.status, detail);
    }

    const raw: unknown = await response.json();

    // Schema-version dispatch
    if (this.schemaVersion === 'canonical') {
      if (!isCanonicalResponse(raw)) {
        throw new Error(
          'FanoClient: schemaVersion="canonical" expected but response is legacy-shape. '
          + 'Set schemaVersion="legacy" or wait for OT #103 production deployment.',
        );
      }
      return raw;
    }

    // schemaVersion === 'legacy' — adapt
    if (isLegacyResponse(raw)) {
      return adaptLegacyResponse(raw);
    }
    if (isCanonicalResponse(raw)) {
      // Production has already migrated; pass through
      return raw;
    }
    throw new Error(
      `FanoClient: response shape unrecognised; neither legacy nor canonical. `
      + `Body keys: ${Object.keys(raw as Record<string, unknown>).join(', ')}`,
    );
  }

  /**
   * Convenience: probe a single line item using the equilibrium-sentinel
   * pattern. Returns only the primary line's response (sentinel is dropped).
   */
  async probeSingleLine(
    line: LineItem,
    entityStructure: TrialBalancePayload['entity_structure'],
  ): Promise<TrialBalanceResponse['results'][number]> {
    const payload = wrapSingleLineProbe(line, entityStructure);
    const response = await this.ingestTrialBalance(payload);
    if (response.results.length === 0) {
      throw new Error('FanoClient.probeSingleLine: response.results is empty');
    }
    return response.results[0]!;
  }
}
