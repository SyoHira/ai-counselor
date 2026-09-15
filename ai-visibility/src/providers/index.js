import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { geminiProvider } from './gemini.js';

const ALL = [anthropicProvider, openaiProvider, geminiProvider];

/** キーとモデルが揃っているプロバイダだけを返す。 */
export function activeProviders() {
  return ALL.filter((p) => p.enabled());
}

export function describeProviders() {
  return ALL.map((p) => ({
    id: p.id,
    model: p.model ?? null,
    enabled: p.enabled(),
  }));
}
