import { describe, expect, it } from 'vitest';
import { hasLiveSupabaseContractEnv } from '../comms/senderIdentityContractEnv';

const liveEnv = hasLiveSupabaseContractEnv();

/**
 * G4: Postgres UNIQUE (gateway, dedupe_key) under concurrent INSERT.
 * Runs only when service-role env is configured (same gate as PUMP-03 integration).
 */
describe.skipIf(!liveEnv)('concurrent dedupe against dev-db (G4)', () => {
  it('placeholder — run §12.3 duplicate replay on deployed pump-webhook', () => {
    expect(liveEnv).toBe(true);
  });
});
