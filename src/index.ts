/**
 * @lodgeit-labs/fano-classifier-client
 *
 * TypeScript SDK for the Fano Classifier integration kit.
 *
 * Public surface:
 * - `FanoClient` — HTTP client wrapping POST /ingest/trial_balance
 * - `FanoApiError` — structured error class
 * - `wrapSingleLineProbe` / `buildEquilibriumSentinel` — single-line probe helpers
 * - `isLegacyResponse` / `isCanonicalResponse` — type guards
 * - `adaptLegacyResponse` / `adaptLegacyLineResponse` — schema transformers
 * - All canonical types (re-exported from `./types`)
 *
 * @example Basic single-line probe
 * ```typescript
 * import { FanoClient } from '@lodgeit-labs/fano-classifier-client';
 *
 * const client = new FanoClient({ apiKey: process.env.FANO_API_KEY! });
 * const result = await client.probeSingleLine({
 *   description: 'Trading Revenue',
 *   predicted_code: 'sbrm_4100',
 *   source_topology: 'revenue',
 *   confidence: 0.95,
 *   amount: 1000.00,
 * }, 'company');
 *
 * console.log(result.fano_status);          // 'accepted_fact' | 'draft_fact' | 'quarantine'
 * console.log(result.predicted_code);       // 'sbrm_4100' (your submission, per Layer 1a)
 * console.log(result.cascade.predicted_code); // cascade's reading (Layer 1b)
 * for (const w of result.warnings) {
 *   console.log(`${w.severity}: ${w.message}`);
 * }
 * ```
 */

export { FanoClient, FanoApiError, DEFAULT_BASE_URL } from './client.js';
export type { FanoClientConfig, SchemaVersion } from './client.js';
export {
  wrapSingleLineProbe,
  buildEquilibriumSentinel,
  isLegacyResponse,
  isCanonicalResponse,
} from './client.js';
export {
  adaptLegacyResponse,
  adaptLegacyLineResponse,
  SUBFLOOR_CONFIDENCE,
} from './adapter.js';
export type * from './types.js';
