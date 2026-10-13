import { PROVIDER_IDS, resolveProviders, publicProvider } from '../../../lib/physics/ai/providers.js';
import { loadSettings, saveSettings, readUsage, summarize, limitReason, validateSettingsUpdate } from '../../../lib/physics/ai/store.js';
import { toErrorResponse } from '../../../lib/physics/ai/errorResponse.js';
import { readPhysicsRequest, PhysicsApiError } from '../../../lib/physics/apiValidation.js';

export const dynamic = 'force-dynamic';

function state() {
  const settings = loadSettings();
  const providers = resolveProviders(settings);
  const entries = readUsage();
  const usage = summarize(entries);
  return {
    order: settings.order,
    settings,
    providers: PROVIDER_IDS.map(id => ({
      ...publicProvider(providers[id]),
      usage: usage[id],
      blockedReason: providers[id].configured ? limitReason(providers[id], usage[id]) : null,
    })),
    recent: entries.slice(-50).reverse(),
  };
}

export async function GET() {
  try {
    return Response.json(state());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const settings = validateSettingsUpdate(await readPhysicsRequest(request));
    try {
      saveSettings(settings);
    } catch {
      throw new PhysicsApiError('設定を保存できませんでした（このPCでローカル実行しているか確認してください）。', 500, 'SETTINGS_NOT_SAVED');
    }
    return Response.json(state());
  } catch (error) {
    return toErrorResponse(error);
  }
}
