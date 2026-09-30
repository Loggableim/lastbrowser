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

export function extractLinkedFiles(linkedFiles: unknown): string[] {
  if (!linkedFiles) return [];
  if (Array.isArray(linkedFiles)) {
    const files: string[] = [];
    for (const item of linkedFiles) {
      if (typeof item === 'string' || typeof item === 'number') {
        const str = String(item).trim();
        if (str) files.push(str);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        for (const key of ['path', 'file', 'name', 'slug', 'id']) {
          const field = record[key];
          if (typeof field === 'string' || typeof field === 'number') {
            const label = String(field).trim();
            if (label) {
              files.push(label);
              break;
            }
          }
        }
      }
    }
    return [...new Set(files.filter(Boolean))];
  }
  if (typeof linkedFiles === 'object') {
    const record = linkedFiles as Record<string, unknown>;
    const files: string[] = [];
    for (const [key, val] of Object.entries(record)) {
      if (typeof val === 'boolean' || val === 1) {
        files.push(key);
      } else if (Array.isArray(val)) {
        for (const sub of val) {
          if (typeof sub === 'string' || typeof sub === 'number') {
            const str = String(sub).trim();
            if (str) files.push(str);
          } else if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
            const subRecord = sub as Record<string, unknown>;
            for (const subKey of ['path', 'file', 'name', 'slug', 'id']) {
              const field = subRecord[subKey];
              if (typeof field === 'string' || typeof field === 'number') {
                const label = String(field).trim();
                if (label) {
                  files.push(label);
                  break;
                }
              }
            }
          }
        }
      } else if (typeof val === 'string' || typeof val === 'number') {
        const str = String(val).trim();
        if (str) files.push(str);
      }
    }
    return [...new Set(files.filter(Boolean))];
  }
  return [];
}
