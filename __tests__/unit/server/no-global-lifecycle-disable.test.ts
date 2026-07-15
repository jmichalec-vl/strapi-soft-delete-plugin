import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const SERVER_SRC = path.resolve(__dirname, '..', '..', '..', 'server', 'src');

const collectTypeScriptFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });

const isCommentLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
};

/**
 * `strapi.db.lifecycles.disable()` is a PROCESS-GLOBAL switch: while it is
 * off, every concurrent request silently skips its DB lifecycles (host
 * validations, timestamps, ...). The plugin uses raw, statement-scoped knex
 * updates instead — no code path may reintroduce the global toggle.
 */
describe('global lifecycle suppression ban', () => {
  it('no server code path calls strapi.db.lifecycles.disable', () => {
    const offenders = collectTypeScriptFiles(SERVER_SRC).filter((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => !isCommentLine(line) && line.includes('lifecycles.disable')),
    );

    expect(offenders).toEqual([]);
  });
});
