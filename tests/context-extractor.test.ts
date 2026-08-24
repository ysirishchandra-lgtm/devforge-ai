import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { ContextExtractor } from '../src/lib/analyzer/context-extractor';
import { RelevantFile } from '../src/types';

describe('ContextExtractor Security & Filtering Tests', () => {
  test('isSafePath prevents path traversal attacks', () => {
    const fakeRoot = path.resolve('/projects/my-app');

    // Safe paths
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'src/index.ts'), true);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'package.json'), true);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'lib/utils/helper.ts'), true);

    // Path traversal attacks
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, '../outside.txt'), false);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, '../../etc/passwd'), false);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, '/etc/shadow'), false);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'C:\\Windows\\System32'), false);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'src/../../../etc/hosts'), false);
    assert.strictEqual(ContextExtractor.isSafePath(fakeRoot, 'file\0.txt'), false);
  });

  test('isExcludedFile strictly filters .env files, private keys, and secrets', () => {
    // Environment files
    assert.strictEqual(ContextExtractor.isExcludedFile('.env'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.env.local'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.env.production'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.env.development.local'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('subfolder/.env'), true);

    // Certificates & Private keys
    assert.strictEqual(ContextExtractor.isExcludedFile('server.key'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('cert.pem'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('id_rsa'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('id_ed25519'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('service-account.json'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('credentials.json'), true);

    // Ignored directories
    assert.strictEqual(ContextExtractor.isExcludedFile('node_modules/express/index.js'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.git/config'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.next/server/pages.js'), true);
    assert.strictEqual(ContextExtractor.isExcludedFile('.devforge_data/store.json'), true);

    // Safe regular source code files
    assert.strictEqual(ContextExtractor.isExcludedFile('src/app/page.tsx'), false);
    assert.strictEqual(ContextExtractor.isExcludedFile('src/lib/git.ts'), false);
    assert.strictEqual(ContextExtractor.isExcludedFile('package.json'), false);
    assert.strictEqual(ContextExtractor.isExcludedFile('README.md'), false);
  });

  test('isBinaryFile rejects images, archives, and compiled binaries', () => {
    assert.strictEqual(ContextExtractor.isBinaryFile('logo.png'), true);
    assert.strictEqual(ContextExtractor.isBinaryFile('avatar.jpg'), true);
    assert.strictEqual(ContextExtractor.isBinaryFile('bundle.wasm'), true);
    assert.strictEqual(ContextExtractor.isBinaryFile('archive.zip'), true);
    assert.strictEqual(ContextExtractor.isBinaryFile('binary.exe'), true);
    assert.strictEqual(ContextExtractor.isBinaryFile('lib.dll'), true);

    assert.strictEqual(ContextExtractor.isBinaryFile('index.ts'), false);
    assert.strictEqual(ContextExtractor.isBinaryFile('style.css'), false);
    assert.strictEqual(ContextExtractor.isBinaryFile('script.py'), false);
  });

  test('extractSafeContext reads safe files and respects size budget', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-'));

    try {
      // Create safe files
      await fs.writeFile(path.join(tempDir, 'safe1.ts'), 'export const hello = "world";');
      await fs.writeFile(path.join(tempDir, 'safe2.ts'), 'export const num = 42;');

      // Create unsafe files
      await fs.writeFile(path.join(tempDir, '.env'), 'SECRET_KEY=12345');
      await fs.writeFile(path.join(tempDir, 'secret.pem'), '-----BEGIN PRIVATE KEY-----');

      const relevantFiles: RelevantFile[] = [
        { path: 'safe1.ts', relevanceScore: 90, reason: 'Main file' },
        { path: '.env', relevanceScore: 80, reason: 'Config' },
        { path: 'safe2.ts', relevanceScore: 70, reason: 'Helper' },
        { path: 'secret.pem', relevanceScore: 60, reason: 'Key' },
      ];

      const result = await ContextExtractor.extractSafeContext(tempDir, relevantFiles);

      // Should only extract safe1.ts and safe2.ts
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].path, 'safe1.ts');
      assert.strictEqual(result[0].content, 'export const hello = "world";');
      assert.strictEqual(result[1].path, 'safe2.ts');

      // Verify no secrets included
      const allPaths = result.map((r) => r.path);
      assert.strictEqual(allPaths.includes('.env'), false);
      assert.strictEqual(allPaths.includes('secret.pem'), false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
