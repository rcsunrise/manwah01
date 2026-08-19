import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const legacyKeyNames = ['GEMINI', 'ROUTERHUB', 'BAILIAN'].map((name) => `${name}_API_KEY`);

const guardedFiles = [
  '.env.example',
  'README.md',
  'MIGRATION_GUIDE.md',
  'TECHNICAL_DOC.md',
  'server.ts',
  'server/utils/aiClient.ts',
  'server/routes/copyRoutes.ts',
  'vite.config.ts'
];

describe('legacy provider key cleanup', () => {
  it.each(guardedFiles)('%s does not reference removed provider environment keys', (file) => {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const keyName of legacyKeyNames) {
      expect(content).not.toContain(keyName);
    }
  });

  it('removes unauthenticated legacy proxy and debug entrypoints', () => {
    const removedFiles = [
      'api/proxy.ts',
      'api/routerhub/generate-image.ts',
      'fetch.ts',
      'fetch_options.ts'
    ];

    for (const file of removedFiles) {
      expect(fs.existsSync(path.join(root, file))).toBe(false);
    }
  });
});
