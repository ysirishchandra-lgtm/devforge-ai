import fs from 'fs/promises';
import path from 'path';
import { PatchProposal, PatchFileChange } from '@/types';
import { ContextExtractor } from '../analyzer/context-extractor';
import { getConfig } from '../config';

export interface ApplyResult {
  success: boolean;
  modifiedFiles: string[];
  backupId: string;
  appliedAt: string;
  error?: string;
}

export class PatchEngine {
  /**
   * Validate a single file change against the repository filesystem
   */
  static async validateChange(
    repoRoot: string,
    change: PatchFileChange
  ): Promise<{ valid: boolean; error?: string }> {
    const relPath = change.filePath.replace(/\\/g, '/');

    // 1. Boundary / Path traversal check
    if (!ContextExtractor.isSafePath(repoRoot, relPath)) {
      return { valid: false, error: `Path traversal detected: "${relPath}"` };
    }

    // 2. Excluded / Secret file check
    if (ContextExtractor.isExcludedFile(relPath)) {
      return { valid: false, error: `Modifying excluded/secret file "${relPath}" is prohibited.` };
    }

    // 3. Binary check
    if (ContextExtractor.isBinaryFile(relPath)) {
      return { valid: false, error: `Cannot apply text patch to binary file "${relPath}".` };
    }

    const fullPath = path.resolve(repoRoot, relPath);

    try {
      const currentContent = await fs.readFile(fullPath, 'utf8');

      if (change.originalSection && change.originalSection.trim().length > 0) {
        const normCurrent = currentContent.replace(/\r\n/g, '\n');
        const normOriginal = change.originalSection.replace(/\r\n/g, '\n');

        if (!normCurrent.includes(normOriginal)) {
          return {
            valid: false,
            error: `Original content in "${relPath}" does not match the target patch section. The file may have changed since the analysis.`,
          };
        }
      }
    } catch {
      // If file doesn't exist, it is a file creation which is allowed if valid path
    }

    return { valid: true };
  }

  /**
   * Create an isolated snapshot backup of affected files
   */
  private static async createBackup(
    repoRoot: string,
    changes: PatchFileChange[]
  ): Promise<string> {
    const config = getConfig();
    const backupId = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const backupDir = path.join(config.storageDir, 'backups', backupId);

    await fs.mkdir(backupDir, { recursive: true });

    for (const change of changes) {
      const sourcePath = path.resolve(repoRoot, change.filePath);
      const targetBackupPath = path.join(backupDir, change.filePath);

      try {
        await fs.mkdir(path.dirname(targetBackupPath), { recursive: true });
        const content = await fs.readFile(sourcePath);
        await fs.writeFile(targetBackupPath, content);
      } catch {
        // File didn't exist prior to patch (new file), create marker
        await fs.writeFile(`${targetBackupPath}.new_file_marker`, '');
      }
    }

    return backupId;
  }

  /**
   * Apply a validated PatchProposal to the target repository
   */
  static async applyPatch(
    repoRoot: string,
    proposal: PatchProposal
  ): Promise<ApplyResult> {
    // Step 1: Pre-validation of all changes
    for (const change of proposal.changes) {
      const validation = await this.validateChange(repoRoot, change);
      if (!validation.valid) {
        return {
          success: false,
          modifiedFiles: [],
          backupId: '',
          appliedAt: new Date().toISOString(),
          error: validation.error,
        };
      }
    }

    // Step 2: Create safe snapshot backup
    const backupId = await this.createBackup(repoRoot, proposal.changes);
    const modifiedFiles: string[] = [];

    // Step 3: Apply each change atomically
    try {
      for (const change of proposal.changes) {
        const fullPath = path.resolve(repoRoot, change.filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        let fileContent = '';
        let fileExists = false;

        try {
          fileContent = await fs.readFile(fullPath, 'utf8');
          fileExists = true;
        } catch {
          fileExists = false;
        }

        let newContent = '';
        if (fileExists && change.originalSection && change.originalSection.trim().length > 0) {
          const normCurrent = fileContent.replace(/\r\n/g, '\n');
          const normOriginal = change.originalSection.replace(/\r\n/g, '\n');
          const normReplacement = change.replacementSection.replace(/\r\n/g, '\n');

          newContent = normCurrent.replace(normOriginal, normReplacement);
        } else {
          newContent = change.replacementSection;
        }

        await fs.writeFile(fullPath, newContent, 'utf8');
        modifiedFiles.push(change.filePath);
      }

      const appliedAt = new Date().toISOString();
      proposal.appliedAt = appliedAt;
      proposal.modifiedFiles = modifiedFiles;
      proposal.backupId = backupId;

      return {
        success: true,
        modifiedFiles,
        backupId,
        appliedAt,
      };
    } catch (applyErr: unknown) {
      // Rollback on any failure
      await this.rollback(repoRoot, backupId);
      const msg = applyErr instanceof Error ? applyErr.message : 'Unknown write error';
      return {
        success: false,
        modifiedFiles: [],
        backupId,
        appliedAt: new Date().toISOString(),
        error: `Patch application failed and was rolled back: ${msg}`,
      };
    }
  }

  /**
   * Rollback changes from a snapshot backup
   */
  static async rollback(repoRoot: string, backupId: string): Promise<boolean> {
    const config = getConfig();
    const backupDir = path.join(config.storageDir, 'backups', backupId);

    try {
      const walkAndRestore = async (currentDir: string, relativeDir = '') => {
        const entries = await fs.readdir(currentDir);
        for (const entry of entries) {
          const fullBackupPath = path.join(currentDir, entry);
          const relPath = relativeDir ? path.join(relativeDir, entry) : entry;
          const stat = await fs.stat(fullBackupPath);

          if (stat.isDirectory()) {
            await walkAndRestore(fullBackupPath, relPath);
          } else if (entry.endsWith('.new_file_marker')) {
            // Remove newly created file that did not exist before
            const createdFilePath = path.resolve(repoRoot, relPath.replace(/\.new_file_marker$/, ''));
            await fs.rm(createdFilePath, { force: true });
          } else {
            // Restore original file
            const destPath = path.resolve(repoRoot, relPath);
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            const content = await fs.readFile(fullBackupPath);
            await fs.writeFile(destPath, content);
          }
        }
      };

      await walkAndRestore(backupDir);
      return true;
    } catch {
      return false;
    }
  }
}
