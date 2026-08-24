import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { simpleGit, SimpleGit } from 'simple-git';
import { getConfig } from '../config';

const execAsync = promisify(exec);

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
        throw new Error(`Path ${repoPath} is not a valid Git repository`);
      }

      const status = await git.status();
      const branch = status.current || 'unknown';
      const isClean = status.isClean();

      let remoteOrigin: string | undefined;
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
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
      throw new Error(`Failed to read git info for ${repoPath}: ${message}`);
    }
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
   * Create an isolated branch for the agent task
   */
  static async createAgentBranch(repoPath: string, taskId: string): Promise<string> {
    const branchName = `devforge/task-${taskId.slice(0, 8)}`;
    const git = simpleGit(repoPath);
    try {
      await git.checkoutLocalBranch(branchName);
      return branchName;
    } catch {
      // If branch already exists, checkout
      await git.checkout(branchName);
      return branchName;
    }
  }

  /**
   * Generate diff comparison for the repository
   */
  static async getDiff(repoPath: string): Promise<string> {
    const git = simpleGit(repoPath);
    return await git.diff();
  }
}
