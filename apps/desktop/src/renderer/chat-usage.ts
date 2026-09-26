export type NativeChatTurnUsage = {
  inputTokens?: number;
  outputTokens?: number;
  tokensPerSecond?: number;
};

export function shouldShowNativeTurnUsage(options: {
  isLatestAssistant: boolean;
  showTokenUsage: boolean;
  showTps: boolean;
  usage: NativeChatTurnUsage | null;
  persistedTps?: number;
}): boolean {
  if (!options.isLatestAssistant) return false;
  return (options.showTokenUsage && options.usage?.inputTokens !== undefined && options.usage.outputTokens !== undefined)
    || (options.showTps && (options.usage?.tokensPerSecond !== undefined || (typeof options.persistedTps === 'number' && Number.isFinite(options.persistedTps) && options.persistedTps >= 0)));
}

export function normalizeNativeChatTurnUsage(value: unknown): NativeChatTurnUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = nonNegativeFiniteNumber(usage.input_tokens);
  const outputTokens = nonNegativeFiniteNumber(usage.output_tokens);
  const tokensPerSecond = nonNegativeFiniteNumber(usage.tps);
  if (inputTokens === undefined && outputTokens === undefined && tokensPerSecond === undefined) return null;
  return { inputTokens, outputTokens, tokensPerSecond };
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
