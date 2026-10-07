export function normalizeLogLines(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.lines)) return record.lines.filter((line): line is string => typeof line === 'string');
  const legacyText = record.text ?? record.logs ?? record.content;
  return typeof legacyText === 'string' ? legacyText.split(/\r?\n/) : [];
}
