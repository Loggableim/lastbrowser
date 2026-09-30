export function normalizeSkillCategory(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'title', 'label', 'slug', 'id']) {
    const field = record[key];
    if (typeof field === 'string' || typeof field === 'number') {
      const label = String(field).trim();
      if (label) return label;
    }
  }
  return '';
}

export function normalizeSkillCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeSkillCategory).filter(Boolean))];
}
