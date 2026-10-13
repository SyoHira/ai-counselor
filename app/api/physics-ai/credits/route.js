import { resolveProviders } from '../../../../lib/physics/ai/providers.js';
import { loadSettings } from '../../../../lib/physics/ai/store.js';
import { toErrorResponse } from '../../../../lib/physics/ai/errorResponse.js';
import { ProviderError } from '../../../../lib/physics/ai/errors.js';
import { PhysicsApiError } from '../../../../lib/physics/apiValidation.js';

export const dynamic = 'force-dynamic';

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

/** OpenRouter 側が把握している実際の利用額・残高（アプリの記録と突き合わせる用） */
export async function GET() {
  try {
    const p = resolveProviders(loadSettings()).openrouter;
    if (!p.hasCredential) throw new PhysicsApiError('OPENROUTER_API_KEY が .env.local にありません。', 503, 'API_KEY_NOT_CONFIGURED');
    const res = await fetch(`${p.baseUrl}/key`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(15000) })
      .catch(() => { throw new ProviderError(0, 'openrouter'); });
    if (!res.ok) throw new ProviderError(res.status, 'openrouter');
    const d = (await res.json())?.data || {};
    return Response.json({
      usage: num(d.usage), usageDaily: num(d.usage_daily), usageMonthly: num(d.usage_monthly),
      limit: num(d.limit), limitRemaining: num(d.limit_remaining), limitReset: typeof d.limit_reset === 'string' ? d.limit_reset : null,
      isFreeTier: typeof d.is_free_tier === 'boolean' ? d.is_free_tier : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
