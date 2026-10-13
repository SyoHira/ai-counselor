import { PROVIDER_IDS, resolveProviders } from '../../../../lib/physics/ai/providers.js';
import { loadSettings } from '../../../../lib/physics/ai/store.js';
import { listOpenAIModels } from '../../../../lib/physics/ai/openaiCompat.js';
import { toErrorResponse } from '../../../../lib/physics/ai/errorResponse.js';
import { PhysicsApiError } from '../../../../lib/physics/apiValidation.js';

export const dynamic = 'force-dynamic';

/** 接続先が今提供しているモデル一覧（モデル名を決め打ちしないため） */
export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get('provider');
    if (!PROVIDER_IDS.includes(id) || id === 'anthropic') throw new PhysicsApiError('接続先を確認してください。');
    const p = resolveProviders(loadSettings())[id];
    if (!p.key || (id !== 'ollama' && !p.hasCredential)) {
      throw new PhysicsApiError(`${p.label} のキーが .env.local にありません。`, 503, 'API_KEY_NOT_CONFIGURED');
    }
    const models = await listOpenAIModels(p, AbortSignal.timeout(15000));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({ models });
  } catch (error) {
    return toErrorResponse(error);
  }
}
