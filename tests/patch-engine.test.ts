import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { PatchEngine } from '../src/lib/patch/patch-engine';
import { PatchGenerator } from '../src/lib/patch/patch-generator';
import { PatchProposal, PatchFileChange } from '../src/types';
import { LLMExecutionResult } from '../src/lib/llm/types';

describe('PatchEngine & Human Approval Workflow Tests', () => {
  test('validateChange passes for valid target file and matching original content', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'service.ts');
      await fs.writeFile(testFile, 'const url = "http://old-url.com";\nconsole.log(url);', 'utf8');

      const change: PatchFileChange = {
        filePath: 'src/service.ts',
        originalSection: 'const url = "http://old-url.com";',
        replacementSection: 'const url = "http://new-url.com";',
        reason: 'Update endpoint',
        expectedEffect: 'Uses new endpoint',
        diffHunks: [],
        linesAdded: 1,
        linesRemoved: 1,
        isValid: true,
      };

      const result = await PatchEngine.validateChange(tempDir, change);
      assert.strictEqual(result.valid, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('validateChange rejects path traversal attacks', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const change: PatchFileChange = {
        filePath: '../../etc/passwd',
        originalSection: 'root:x:0:0',
        replacementSection: 'hacked:x:0:0',
        reason: 'Attack',
        expectedEffect: 'Escape',
        diffHunks: [],
        linesAdded: 1,
        linesRemoved: 1,
        isValid: false,
      };

      const result = await PatchEngine.validateChange(tempDir, change);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Path traversal'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('validateChange rejects attempts to modify .env or secret files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const change: PatchFileChange = {
        filePath: '.env.local',
        originalSection: 'KEY=old',
        replacementSection: 'KEY=new',
        reason: 'Change key',
        expectedEffect: 'Override',
        diffHunks: [],
        linesAdded: 1,
        linesRemoved: 1,
        isValid: false,
      };

      const result = await PatchEngine.validateChange(tempDir, change);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Modifying excluded/secret file'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('validateChange rejects stale/mismatched original content', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const testFile = path.join(tempDir, 'app.ts');
      await fs.writeFile(testFile, 'const count = 100;', 'utf8');

      const change: PatchFileChange = {
        filePath: 'app.ts',
        originalSection: 'const count = 999;', // does not exist in file
        replacementSection: 'const count = 200;',
        reason: 'Update count',
        expectedEffect: 'Doubled',
        diffHunks: [],
        linesAdded: 1,
        linesRemoved: 1,
        isValid: false,
      };

      const result = await PatchEngine.validateChange(tempDir, change);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('does not match'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('applyPatch creates backup snapshot and applies changes atomically', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const filePath = path.join(tempDir, 'config.ts');
      const originalCode = 'export const PORT = 3000;\nexport const HOST = "localhost";';
      await fs.writeFile(filePath, originalCode, 'utf8');

      const proposal: PatchProposal = {
        id: 'test-patch-1',
        taskId: 'task-1',
        summary: 'Update PORT to 8080',
        changes: [
          {
            filePath: 'config.ts',
            originalSection: 'export const PORT = 3000;',
            replacementSection: 'export const PORT = 8080;',
            reason: 'Change default port',
            expectedEffect: 'Port 8080 used',
            diffHunks: [],
            linesAdded: 1,
            linesRemoved: 1,
            isValid: true,
          },
        ],
        createdAt: new Date().toISOString(),
      };

      const result = await PatchEngine.applyPatch(tempDir, proposal);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.modifiedFiles.length, 1);
      assert.ok(result.backupId.length > 0);

      // Verify file was updated accurately
      const newContent = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(newContent, 'export const PORT = 8080;\nexport const HOST = "localhost";');

      // Test rollback
      const rollbackOk = await PatchEngine.rollback(tempDir, result.backupId);
      assert.strictEqual(rollbackOk, true);

      const restoredContent = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(restoredContent, originalCode);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('PatchGenerator computes valid unified diffs', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-patch-'));
    try {
      const filePath = path.join(tempDir, 'login.ts');
      await fs.writeFile(filePath, 'const url = "wrong-url";\nconst timeout = 5000;', 'utf8');

      const llmResult: LLMExecutionResult = {
        analysis: {
          problemUnderstanding: 'Bug in URL',
          rootCauseHypothesis: 'Wrong endpoint',
          relevantFilesAnalysis: [],
          proposedSolution: 'Fix endpoint',
          implementationSteps: ['Step 1'],
          potentialRisks: [],
          estimatedComplexity: 'simple',
          proposedPatchChanges: [
            {
              filePath: 'login.ts',
              originalSection: 'const url = "wrong-url";',
              replacementSection: 'const url = "correct-url";',
              reason: 'Fix wrong endpoint',
              expectedEffect: 'Targets correct endpoint',
            },
          ],
        },
        provider: 'Google Gemini',
        model: 'gemini-3.6-flash',
        latencyMs: 500,
      };

      const proposal = await PatchGenerator.generateProposal('task-123', tempDir, llmResult);

      assert.strictEqual(proposal.changes.length, 1);
      const change = proposal.changes[0];
      assert.strictEqual(change.filePath, 'login.ts');
      assert.strictEqual(change.isValid, true);
      assert.strictEqual(change.linesAdded, 1);
      assert.strictEqual(change.linesRemoved, 1);
      assert.ok(change.diffHunks.some((h) => h.includes('+const url = "correct-url";')));
      assert.ok(change.diffHunks.some((h) => h.includes('-const url = "wrong-url";')));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
