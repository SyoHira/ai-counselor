// AIの接続先。キーは .env.local だけに置き、モデル名・上限・優先順は設定画面（data/ai-settings.json）で管理する。
// モデル名は各社で頻繁に変わるので決め打ちせず、設定画面で各社の /models 一覧から選ぶ。

export const PROVIDER_IDS = ['gemini', 'openrouter', 'ollama', 'anthropic'];

export const PROVIDER_INFO = {
  gemini: {
    label: 'Google Gemini', kind: 'openai', costNote: '無料枠（上限は AI Studio で確認）',
    keyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    dashboard: 'https://aistudio.google.com/usage',
  },
  openrouter: {
    label: 'OpenRouter', kind: 'openai', costNote: '従量課金（:free モデルは無料）',
    keyEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    dashboard: 'https://openrouter.ai/activity',
  },
  ollama: {
    label: 'Ollama（ローカル）', kind: 'openai', costNote: '無料・データは外に出ない',
    keyEnv: null, modelEnv: 'OLLAMA_MODEL', baseUrlEnv: 'OLLAMA_BASE_URL',
    defaultBaseUrl: 'http://localhost:11434/v1',
    dashboard: null,
  },
  anthropic: {
    label: 'Claude', kind: 'anthropic', costNote: '従量課金',
    keyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL',
    defaultBaseUrl: null, defaultModel: 'claude-opus-5',
    dashboard: 'https://console.anthropic.com/settings/usage',
  },
};

const usableKey = value => value && value !== 'your-api-key-here' ? value : null;

/** 環境変数と設定を合わせた、実際に呼び出せる接続先の情報。キーそのものはクライアントへ返さない。 */
export function resolveProviders(settings, env = process.env) {
  return Object.fromEntries(PROVIDER_IDS.map(id => {
    const info = PROVIDER_INFO[id];
    const s = settings.providers[id];
    const key = info.keyEnv ? usableKey(env[info.keyEnv]) : 'ollama';
    const model = s.model || env[info.modelEnv] || info.defaultModel || '';
    const baseUrl = ((info.baseUrlEnv && env[info.baseUrlEnv]) || info.defaultBaseUrl || '').replace(/\/+$/, '');
    // Ollama はキー不要なので、モデルを選んだ時点で使えるものとみなす
    const hasCredential = id === 'ollama' ? Boolean(env.OLLAMA_MODEL || env.OLLAMA_BASE_URL || s.model) : Boolean(key);
    return [id, {
      id, ...info, key, model, baseUrl,
      hasCredential, configured: hasCredential && Boolean(model), enabled: s.enabled,
      limits: { dailyRequests: s.dailyRequests, monthlyUsd: s.monthlyUsd },
    }];
  }));
}

export function publicProvider(p) {
  const { key, ...rest } = p;
  return rest;
}
