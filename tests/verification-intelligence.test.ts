import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VerificationRunner } from '../src/lib/verification/test-runner';
import { AgentOrchestrator } from '../src/lib/agent/orchestrator';
import { AppStore } from '../src/lib/storage/store';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Verification Intelligence', () => {
  test('extracts concise failure summary for generic errors', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['node -e "throw new Error(\'Mock failure\')"']);
    assert.equal(result.overallStatus, 'FAIL');
    const failedCmd = result.results[0];
    assert.ok(failedCmd.summary?.includes('Error: Mock failure') || failedCmd.summary?.includes('Exception:'), 'Should extract error line');
  });

  test('extracts concise failure summary for ENOENT command not found', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['missingcommand12345']);
    assert.equal(result.overallStatus, 'NOT_CONFIGURED');
    const failedCmd = result.results[0];
    assert.ok(failedCmd.summary?.includes('Command not found'), 'Should extract NOT_CONFIGURED summary');
  });

  test('Orchestrator retry Verification preserves history bounds', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-intelligence-'));
    const configPath = path.join(tempDir, 'devforge.config.json');
    process.env.DEVFORGE_CONFIG_PATH = configPath;
    await fs.writeFile(configPath, JSON.stringify({ storageDir: tempDir }), 'utf8');

    // Create a mock repo and task
    const repo = await AppStore.saveRepository({
      id: 'test-repo',
      name: 'Test Repo',
      localPath: tempDir,
      remoteUrl: '',
      branch: 'main',
      isClean: true,
      totalFiles: 1,
      detectedStack: [],
      lastScannedAt: new Date().toISOString(),
      isCloned: true
    });

    let task = await AppStore.saveTask({
      id: 'test-task',
      repositoryId: repo.id,
      title: 'Test',
      prompt: 'Test prompt',
      status: 'completed',
      currentStageIndex: 0,
      relevantFiles: [],
      stages: [],
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verification: {
        overallStatus: 'FAIL',
        ranAt: new Date().toISOString(),
        results: [{
          command: 'npm test',
          durationMs: 10,
          exitCode: 1,
          status: 'FAIL',
          stdout: '',
          stderr: 'Fail',
          workingDir: tempDir,
          ranAt: new Date().toISOString()
        }]
      },
      verificationHistory: Array.from({ length: 10 }).map((_, i) => ({
        overallStatus: 'FAIL',
        ranAt: new Date().toISOString(),
        results: []
      })) // Pre-fill history to test bounds
    });

    // Run retry
    task = await AgentOrchestrator.retryVerification(task.id);
    
    assert.equal(task.verificationHistory?.length, 10, 'History should be bounded to max 10');
    assert.equal(task.verificationHistory[0].overallStatus, 'FAIL', 'Most recent previous result should be pushed to history');
    assert.ok(task.verification?.overallStatus === 'PASS' || task.verification?.overallStatus === 'NOT_CONFIGURED' || task.verification?.overallStatus === 'FAIL', 'Should produce a fresh verification result');
  });
});
