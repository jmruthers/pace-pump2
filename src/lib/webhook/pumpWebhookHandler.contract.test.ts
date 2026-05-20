import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUMP_EDGE_PATH = resolve(
  process.cwd(),
  '../pace-core2/packages/core/supabase/functions/_shared/pump-edge.ts'
);

describe('handleWebhook ingress contract', () => {
  it('returns 401 on failed signature before ingress/apply', () => {
    const source = readFileSync(PUMP_EDGE_PATH, 'utf8');
    expect(source).toContain('if (!verified) return new Response(null, { status: 401 })');
    expect(source).toContain('processWebhookIngressApply');
    const resendBlock = source.slice(
      source.indexOf('if (gateway === \'resend\')'),
      source.indexOf('} else {', source.indexOf('if (gateway === \'resend\')'))
    );
    expect(resendBlock.indexOf('verifyResendSignature')).toBeLessThan(
      resendBlock.indexOf('validateResendPayload')
    );
  });

  it('returns 404 for unknown gateway without verification', () => {
    const source = readFileSync(PUMP_EDGE_PATH, 'utf8');
    expect(source).toContain('if (!gateway) {\n    return new Response(null, { status: 404 })');
  });
});
