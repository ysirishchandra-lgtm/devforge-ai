import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { simpleGit } from 'simple-git';
import { GitService } from '../src/lib/git/git-service';
import { AppStore } from '../src/lib/storage/store';
import { TaskRun, Repository } from '../src/types';

// Ensure Git is in PATH on Windows
if (process.platform === 'win32') {
  const fsSync = require('fs');
  const gitPaths = ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\Git\\bin'];
  for (const p of gitPaths) {
    if (fsSync.existsSync(p) && !process.env.PATH?.includes(p)) {
      process.env.PATH = `${p};${process.env.PATH}`;
    }
  }
}

describe('Safe GitHub Developer Workflow Tests', () => {
  test('sanitizeBranchName produces predictable and safe branch names', () => {
    // 1. Basic formatting
    const name1 = GitService.sanitizeBranchName('Fix login endpoint bug');
    assert.strictEqual(name1, 'devforge/fix/login-endpoint-bug');

    // 2. Strips invalid git ref characters (~, ^, :, ?, *, [, \, @{, //, ..)
    const name2 = GitService.sanitizeBranchName('Fix: user auth error in auth-service! [v2.0] ~HEAD^1..');
    assert.ok(!name2.includes(':'));
    assert.ok(!name2.includes('!'));
    assert.ok(!name2.includes('['));
    assert.ok(!name2.includes(']'));
    assert.ok(!name2.includes('~'));
    assert.ok(!name2.includes('^'));
    assert.ok(!name2.includes('..'));
    assert.ok(name2.startsWith('devforge/fix/'));

    // 3. Path traversal attack in topic
    const name3 = GitService.sanitizeBranchName('../../hack/override');
    assert.ok(!name3.includes('..'));
    assert.ok(!name3.includes('//'));
    assert.ok(name3.startsWith('devforge/fix/'));

    // 4. Empty or invalid input fallback
    const name4 = GitService.sanitizeBranchName('');
    assert.ok(name4.startsWith('devforge/fix/repair-'));

    // 5. Custom prefix
    const name5 = GitService.sanitizeBranchName('optimize query', 'devforge/perf/');
    assert.strictEqual(name5, 'devforge/perf/optimize-query');
  });

  test('getWorkingTreeStatus detects modified files and flags unrelated dirty changes', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-git-tree-'));
    try {
      const git = simpleGit(tempDir);
      await git.init();
      await git.addConfig('user.name', 'DevForge Test');
      await git.addConfig('user.email', 'test@devforge.local');

      // Create initial commit
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.writeFile(file1, 'initial 1\n', 'utf8');
      await fs.writeFile(file2, 'initial 2\n', 'utf8');
      await git.add('.');
      await git.commit('initial commit');

      // Case A: Only expected file modified
      await fs.writeFile(file1, 'modified 1\n', 'utf8');
      const statusA = await GitService.getWorkingTreeStatus(tempDir, ['file1.txt']);
      assert.strictEqual(statusA.isRepo, true);
      assert.strictEqual(statusA.hasUnrelatedChanges, false);
      assert.strictEqual(statusA.modifiedFiles.length, 1);

      // Case B: Unrelated file also modified
      await fs.writeFile(file2, 'unrelated dirty change\n', 'utf8');
      const statusB = await GitService.getWorkingTreeStatus(tempDir, ['file1.txt']);
      assert.strictEqual(statusB.hasUnrelatedChanges, true);
      assert.ok(statusB.unrelatedFiles.includes('file2.txt'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('createRepairBranch creates dedicated branch and isolates changes safely', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-git-branch-'));
    try {
      const git = simpleGit(tempDir);
      await git.init();
      await git.addConfig('user.name', 'DevForge Test');
      await git.addConfig('user.email', 'test@devforge.local');

      // Initial commit on main
      const file = path.join(tempDir, 'auth.ts');
      await fs.writeFile(file, 'export const endpoint = "wrong";\n', 'utf8');
      await git.add('.');
      await git.commit('chore: init');

      // Apply patch locally
      await fs.writeFile(file, 'export const endpoint = "correct";\n', 'utf8');

      // Create repair branch
      const branchInfo = await GitService.createRepairBranch(tempDir, {
        topic: 'Fix auth endpoint',
        taskId: 'task-100',
        patchFiles: ['auth.ts'],
      });

      assert.strictEqual(branchInfo.branchName, 'devforge/fix/auth-endpoint');
      assert.strictEqual(branchInfo.status, 'BRANCH_READY');
      assert.strictEqual(branchInfo.changedFiles.length, 1);
      assert.strictEqual(branchInfo.changedFiles[0].path, 'auth.ts');
      assert.ok(branchInfo.diffSummary.insertions > 0);
      assert.ok(branchInfo.diffSummary.deletions > 0);
      assert.ok(branchInfo.rawDiff?.includes('+export const endpoint = "correct";'));

      // Verify current branch switched to repair branch
      const status = await git.status();
      assert.strictEqual(status.current, 'devforge/fix/auth-endpoint');

      // Test collision safety: creating again creates safe distinct suffix
      const branchInfo2 = await GitService.createRepairBranch(tempDir, {
        topic: 'Fix auth endpoint',
        taskId: 'task-101',
        patchFiles: ['auth.ts'],
      });
      assert.ok(branchInfo2.branchName.startsWith('devforge/fix/auth-endpoint'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('createRepairBranch rejects non-git directories with descriptive error', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-non-git-'));
    try {
      await assert.rejects(
        async () => {
          await GitService.createRepairBranch(tempDir, {
            topic: 'Fix bug',
            taskId: 'task-999',
          });
        },
        /not a valid Git repository/
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('createRepairBranch blocks when unrelated dirty files exist in working tree', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-git-dirty-'));
    try {
      const git = simpleGit(tempDir);
      await git.init();
      await git.addConfig('user.name', 'DevForge Test');
      await git.addConfig('user.email', 'test@devforge.local');

      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      await fs.writeFile(file1, 'file1', 'utf8');
      await fs.writeFile(file2, 'file2', 'utf8');
      await git.add('.');
      await git.commit('init');

      // Modify both files, but patch only claimed file1.ts
      await fs.writeFile(file1, 'file1 modified', 'utf8');
      await fs.writeFile(file2, 'file2 dirty', 'utf8');

      await assert.rejects(
        async () => {
          await GitService.createRepairBranch(tempDir, {
            topic: 'Fix file 1',
            taskId: 'task-102',
            patchFiles: ['file1.ts'],
          });
        },
        /Working tree contains unrelated uncommitted changes in: file2.ts/
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
