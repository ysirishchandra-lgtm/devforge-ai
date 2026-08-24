import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import { getConfig } from '../config';
import { GitFileChange, GitRepairBranchInfo, GitWorkflowStatus } from '@/types';
import { ContextExtractor } from '../analyzer/context-extractor';

const execAsync = promisify(exec);

export interface WorkingTreeStatus {
  isRepo: boolean;
  currentBranch: string;
  isClean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  deletedFiles: string[];
  hasUnrelatedChanges: boolean;
  unrelatedFiles: string[];
}

export class GitService {
  /**
   * Check if git is installed on the host machine and get its version
   */
  static async getGitVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('git --version');
      return stdout.trim();
    } catch {
      throw new Error('Git is not installed or not found in system PATH');
    }
  }

  /**
   * Sanitize a branch name to ensure safe and predictable git naming conventions
   */
  static sanitizeBranchName(topic: string, prefix = 'devforge/fix/'): string {
    if (!topic || typeof topic !== 'string') {
      return `${prefix}repair-${Date.now().toString(36)}`;
    }

    // 1. Remove any known secret patterns or paths
    let clean = topic.toLowerCase();

    // 2. Extract key words or slug
    clean = clean
      .replace(/[^\w\s-]/g, ' ') // replace special chars with spaces
      .replace(/\s+/g, '-')      // replace spaces with hyphens
      .replace(/-+/g, '-')       // collapse multi-hyphens
      .replace(/^-+|-+$/g, '');  // trim hyphens

    // Strip common filler words
    const stopwords = ['the', 'a', 'an', 'in', 'on', 'to', 'for', 'of', 'and', 'with', 'from', 'this', 'that', 'why', 'find', 'fix', 'fixes', 'fixed'];
    const parts = clean.split('-').filter((p) => p && !stopwords.includes(p));
    let slug = parts.slice(0, 5).join('-');

    if (!slug) {
      slug = `repair-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Git ref name restrictions: no consecutive slashes, no leading/trailing slashes
    const fullBranch = `${prefix}${slug}`.slice(0, 60).replace(/-+$/, '');
    return fullBranch;
  }

  /**
   * Verify repository status and branch details
   */
  static async getRepoInfo(repoPath: string): Promise<{
    branch: string;
    isClean: boolean;
    remoteOrigin?: string;
    latestCommit?: { hash: string; message: string; author: string; date: string };
  }> {
    try {
      const git: SimpleGit = simpleGit(repoPath);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`Path "${repoPath}" is not a valid Git repository`);
      }

      const status = await git.status();
      const branch = status.current || 'unknown';
      const isClean = status.isClean();

      let remoteOrigin: string | undefined;
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === 'origin');
        remoteOrigin = origin?.refs?.fetch || origin?.refs?.push;
      } catch {
        // No remotes configured
      }

      let latestCommit: { hash: string; message: string; author: string; date: string } | undefined;
      try {
        const log = await git.log({ maxCount: 1 });
        if (log.latest) {
          latestCommit = {
            hash: log.latest.hash,
            message: log.latest.message,
            author: log.latest.author_name,
            date: log.latest.date,
          };
        }
      } catch {
        // No commits yet
      }

      return {
        branch,
        isClean,
        remoteOrigin,
        latestCommit,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read git info for "${repoPath}": ${message}`);
    }
  }

  /**
   * Check the repository working tree status and inspect for unrelated uncommitted changes
   */
  static async getWorkingTreeStatus(
    repoPath: string,
    expectedModifiedFiles: string[] = []
  ): Promise<WorkingTreeStatus> {
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        currentBranch: 'unknown',
        isClean: false,
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        deletedFiles: [],
        hasUnrelatedChanges: false,
        unrelatedFiles: [],
      };
    }

    const status: StatusResult = await git.status();
    const currentBranch = status.current || 'unknown';
    const isClean = status.isClean();

    const normExpected = expectedModifiedFiles.map((f) => f.replace(/\\/g, '/'));

    const modifiedFiles = status.modified.map((f) => f.replace(/\\/g, '/'));
    const untrackedFiles = status.not_added.map((f) => f.replace(/\\/g, '/'));
    const stagedFiles = status.staged.map((f) => f.replace(/\\/g, '/'));
    const deletedFiles = status.deleted.map((f) => f.replace(/\\/g, '/'));

    const allChanged = Array.from(new Set([...modifiedFiles, ...stagedFiles, ...deletedFiles]));

    // Find any changes not accounted for in expectedModifiedFiles
    const unrelatedFiles = allChanged.filter(
      (f) => !normExpected.includes(f) && !f.startsWith('.devforge_data')
    );

    return {
      isRepo: true,
      currentBranch,
      isClean,
      modifiedFiles,
      untrackedFiles,
      stagedFiles,
      deletedFiles,
      hasUnrelatedChanges: unrelatedFiles.length > 0,
      unrelatedFiles,
    };
  }

  /**
   * Clone a remote GitHub repository to the local managed workspace
   */
  static async cloneRepository(
    remoteUrl: string,
    customName?: string
  ): Promise<{ localPath: string; branch: string; repoName: string }> {
    const config = getConfig();
    await fs.mkdir(config.workspacesDir, { recursive: true });

    // Derive folder name from URL
    const urlParts = remoteUrl.replace(/\.git$/, '').split('/');
    const repoName = customName || urlParts[urlParts.length - 1] || `repo-${Date.now()}`;
    const targetPath = path.join(config.workspacesDir, repoName);

    // Check if folder already exists
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        const git = simpleGit(targetPath);
        const isRepo = await git.checkIsRepo();
        if (isRepo) {
          const status = await git.status();
          return {
            localPath: targetPath,
            branch: status.current || 'main',
            repoName,
          };
        }
      }
    } catch {
      // Directory doesn't exist yet, proceed with clone
    }

    const git = simpleGit();
    await git.clone(remoteUrl, targetPath);

    const clonedGit = simpleGit(targetPath);
    const status = await clonedGit.status();

    return {
      localPath: targetPath,
      branch: status.current || 'main',
      repoName,
    };
  }

  /**
   * List all changed files with their status
   */
  static async getChangedFiles(repoPath: string): Promise<GitFileChange[]> {
    const git = simpleGit(repoPath);
    const status = await git.status();

    const changes: GitFileChange[] = [];

    for (const file of status.modified) {
      changes.push({ path: file.replace(/\\/g, '/'), status: 'modified' });
    }
    for (const file of status.created) {
      changes.push({ path: file.replace(/\\/g, '/'), status: 'added' });
    }
    for (const file of status.deleted) {
      changes.push({ path: file.replace(/\\/g, '/'), status: 'deleted' });
    }
    for (const file of status.renamed) {
      changes.push({ path: file.to.replace(/\\/g, '/'), status: 'renamed' });
    }
    for (const file of status.not_added) {
      if (!file.startsWith('.devforge_data')) {
        changes.push({ path: file.replace(/\\/g, '/'), status: 'untracked' });
      }
    }

    return changes;
  }

  /**
   * Generate raw git diff output
   */
  static async getGitDiff(repoPath: string): Promise<string> {
    const git = simpleGit(repoPath);
    return await git.diff();
  }

  /**
   * Safely create and check out a dedicated repair branch
   */
  static async createRepairBranch(
    repoPath: string,
    options: {
      topic?: string;
      taskId: string;
      patchFiles?: string[];
      prefix?: string;
    }
  ): Promise<GitRepairBranchInfo> {
    // 1. Safety verification of repository
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`Target path "${repoPath}" is not a valid Git repository.`);
    }

    // 2. Inspect working tree status
    const treeStatus = await this.getWorkingTreeStatus(repoPath, options.patchFiles || []);
    if (treeStatus.hasUnrelatedChanges) {
      throw new Error(
        `Working tree contains unrelated uncommitted changes in: ${treeStatus.unrelatedFiles.join(', ')}. ` +
        `Please stash or commit these changes before creating a repair branch.`
      );
    }

    const baseBranch = treeStatus.currentBranch || 'main';

    // 3. Generate sanitized branch name
    const rawBranchName = this.sanitizeBranchName(
      options.topic || `task-${options.taskId}`,
      options.prefix || 'devforge/fix/'
    );

    // 4. Check for existing local branches
    const localBranches = await git.branchLocal();
    let finalBranchName = rawBranchName;

    if (localBranches.all.includes(rawBranchName)) {
      if (localBranches.current === rawBranchName) {
        // Already on this repair branch
        finalBranchName = rawBranchName;
      } else {
        // Collision: Generate non-destructive unique suffix rather than overwriting
        const shortSuffix = Math.random().toString(36).slice(2, 6);
        finalBranchName = `${rawBranchName}-${shortSuffix}`;
      }
    }

    // 5. Create and switch to the new repair branch
    try {
      if (localBranches.current !== finalBranchName) {
        if (localBranches.all.includes(finalBranchName)) {
          await git.checkout(finalBranchName);
        } else {
          await git.checkoutLocalBranch(finalBranchName);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to checkout repair branch "${finalBranchName}": ${msg}`);
    }

    // 6. Gather changed files and diff summary
    const changedFiles = await this.getChangedFiles(repoPath);
    const rawDiff = await this.getGitDiff(repoPath);

    // Count insertions and deletions
    let insertions = 0;
    let deletions = 0;
    const diffLines = rawDiff.split('\n');
    for (const line of diffLines) {
      if (line.startsWith('+') && !line.startsWith('+++')) insertions++;
      if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    return {
      branchName: finalBranchName,
      baseBranch,
      createdAt: new Date().toISOString(),
      status: 'BRANCH_READY',
      changedFiles,
      diffSummary: {
        totalFiles: changedFiles.length,
        insertions,
        deletions,
      },
      rawDiff,
    };
  }
}
