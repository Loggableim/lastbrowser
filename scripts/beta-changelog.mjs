import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const dataFile = path.join(rootDir, 'changelog', 'betas.json');
const schemaFile = path.join(rootDir, 'changelog', 'betas.schema.json');
const markdownFile = path.join(rootDir, 'changelog', 'BETAS.md');
const repositoryUrl = 'https://github.com/Loggableim/lastbrowser';

const changeKindLabels = {
  feature: 'Feature',
  fix: 'Fix',
  improvement: 'Verbesserung',
  security: 'Sicherheit',
  docs: 'Dokumentation',
  build: 'Build',
};

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadBetaChangelog(root = rootDir) {
  return {
    data: readJson(path.join(root, 'changelog', 'betas.json')),
    schema: readJson(path.join(root, 'changelog', 'betas.schema.json')),
    markdown: readFileSync(path.join(root, 'changelog', 'BETAS.md'), 'utf8').replace(/\r\n/g, '\n'),
  };
}

function resolveReference(schema, rootSchema) {
  if (!schema.$ref) return schema;
  const match = /^#\/(.+)$/.exec(schema.$ref);
  if (!match) throw new Error(`Unsupported $ref: ${schema.$ref}`);
  let current = rootSchema;
  for (const segment of match[1].split('/')) {
    current = current?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (current === undefined) throw new Error(`Unresolved $ref: ${schema.$ref}`);
  }
  return current;
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function matchesType(value, type) {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'null':
      return value === null;
    default:
      throw new Error(`Unsupported schema type: ${type}`);
  }
}

function validateNode(value, schema, rootSchema, location, errors) {
  const resolved = resolveReference(schema, rootSchema);

  if ('const' in resolved && !sameJsonValue(value, resolved.const)) {
    errors.push(`${location}: expected constant ${JSON.stringify(resolved.const)}`);
    return;
  }
  if (Array.isArray(resolved.enum) && !resolved.enum.some((entry) => sameJsonValue(value, entry))) {
    errors.push(`${location}: expected one of ${resolved.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
    return;
  }
  if (resolved.type && !matchesType(value, resolved.type)) {
    errors.push(`${location}: expected ${resolved.type}`);
    return;
  }

  if (typeof value === 'string') {
    if (resolved.minLength !== undefined && [...value].length < resolved.minLength) {
      errors.push(`${location}: must contain at least ${resolved.minLength} characters`);
    }
    if (resolved.pattern && !new RegExp(resolved.pattern).test(value)) {
      errors.push(`${location}: does not match ${resolved.pattern}`);
    }
    if (resolved.format === 'date' && !isDate(value)) {
      errors.push(`${location}: expected an ISO date (YYYY-MM-DD)`);
    }
  }

  if (Array.isArray(value)) {
    if (resolved.minItems !== undefined && value.length < resolved.minItems) {
      errors.push(`${location}: must contain at least ${resolved.minItems} items`);
    }
    if (resolved.uniqueItems) {
      for (let index = 1; index < value.length; index += 1) {
        if (value.slice(0, index).some((entry) => sameJsonValue(entry, value[index]))) {
          errors.push(`${location}[${index}]: duplicate item`);
        }
      }
    }
    if (resolved.items) {
      value.forEach((entry, index) => validateNode(entry, resolved.items, rootSchema, `${location}[${index}]`, errors));
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of resolved.required ?? []) {
      if (!(required in value)) errors.push(`${location}: missing required property ${required}`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const propertySchema = resolved.properties?.[key];
      if (propertySchema) {
        validateNode(entry, propertySchema, rootSchema, `${location}.${key}`, errors);
        continue;
      }
      if (resolved.additionalProperties === false) {
        errors.push(`${location}: unexpected property ${key}`);
      }
    }
  }
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareVersion(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftPart) - Number(rightPart);
      if (difference !== 0) return difference < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return 0;
}

function validateReleaseOrder(releases, errors) {
  const seen = new Set();
  for (let index = 0; index < releases.length; index += 1) {
    const release = releases[index];
    if (seen.has(release.version)) {
      errors.push(`$.releases[${index}].version: duplicate version ${release.version}`);
    }
    seen.add(release.version);

    if (index > 0) {
      const previous = releases[index - 1];
      if (compareVersion(previous.version, release.version) < 0) {
        errors.push(`$.releases[${index}]: releases must be ordered newest first`);
      }
      if (previous.date < release.date) {
        errors.push(`$.releases[${index}].date: release dates must be ordered newest first`);
      }
    }
  }
}

export function validateBetaChangelog(data, schema) {
  const errors = [];
  validateNode(data, schema, schema, '$', errors);
  if (errors.length === 0) validateReleaseOrder(data.releases, errors);
  return errors;
}

export function renderBetaChangelogMarkdown(data) {
  const sections = data.releases.map((release) => {
    const lines = [
      `## ${release.label} — ${release.date}`,
      '',
      `- Version: \`${release.version}\``,
      `- Build: \`${release.build}\``,
      `- Commit: [\`${release.commit.slice(0, 8)}\`](${repositoryUrl}/commit/${release.commit})`,
      `- Basis: Stable \`${release.sinceStable}\``,
      `- Signiert: ${release.signed ? 'ja' : 'nein'}`,
      '',
      '### Änderungen',
      '',
      ...release.changes.map((change) => {
        const label = changeKindLabels[change.kind] ?? change.kind;
        return change.description
          ? `- **${label} – ${change.title}:** ${change.description}`
          : `- **${label} – ${change.title}**`;
      }),
    ];
    if (release.notes?.length) {
      lines.push('', '### Hinweise', '', ...release.notes.map((note) => `- ${note}`));
    }
    return lines.join('\n');
  });

  return [
    '# LastBrowser Tagesbeta-Changelog',
    '',
    '<!-- Generated by `scripts/beta-changelog.mjs --write` from `changelog/betas.json`. Do not edit manually. -->',
    '',
    'Tagesbetas sind unsigniert, sofern nicht anders angegeben. Stabile Releases stehen in [CHANGELOG.md](../CHANGELOG.md).',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');
}

function main() {
  const data = readJson(dataFile);
  const schema = readJson(schemaFile);
  const errors = validateBetaChangelog(data, schema);

  if (errors.length > 0) {
    console.error(`Invalid beta changelog (${dataFile}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const markdown = renderBetaChangelogMarkdown(data);
  if (process.argv.includes('--write')) {
    writeFileSync(markdownFile, markdown, 'utf8');
    console.log(`Wrote ${path.relative(rootDir, markdownFile)} (${data.releases.length} releases).`);
    return;
  }

  const current = readFileSync(markdownFile, 'utf8').replace(/\r\n/g, '\n');
  if (current !== markdown) {
    console.error(`${path.relative(rootDir, markdownFile)} is out of date; run: node scripts/beta-changelog.mjs --write`);
    process.exit(1);
  }

  console.log(`Beta changelog is valid (${data.releases.length} releases).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
