import fs from 'fs/promises';
import path from 'path';
import * as diff from 'diff';
import { PatchProposal, PatchFileChange, ExtractedFileContext } from '@/types';
import { LLMExecutionResult } from '../llm/types';
import { ContextExtractor } from '../analyzer/context-extractor';

export class PatchGenerator {
  /**
   * Generate a structured PatchProposal from LLM execution result
   */
  static async generateProposal(
    taskId: string,
    repoRoot: string,
    llmResult: LLMExecutionResult,
    extractedContext: ExtractedFileContext[] = []
  ): Promise<PatchProposal> {
    const rawChanges = llmResult.analysis.proposedPatchChanges || [];
    const changes: PatchFileChange[] = [];

    for (const rawChange of rawChanges) {
      const relPath = rawChange.filePath.replace(/\\/g, '/');

      // Security check: path traversal
      if (!ContextExtractor.isSafePath(repoRoot, relPath)) {
        changes.push({
          filePath: relPath,
          originalSection: rawChange.originalSection,
          replacementSection: rawChange.replacementSection,
          reason: rawChange.reason,
          expectedEffect: rawChange.expectedEffect,
          diffHunks: [],
          linesAdded: 0,
          linesRemoved: 0,
          isValid: false,
          validationError: `Security violation: Path traversal detected for "${relPath}".`,
        });
        continue;
      }

      // Security check: excluded files (.env, secrets)
      if (ContextExtractor.isExcludedFile(relPath)) {
        changes.push({
          filePath: relPath,
          originalSection: rawChange.originalSection,
          replacementSection: rawChange.replacementSection,
          reason: rawChange.reason,
          expectedEffect: rawChange.expectedEffect,
          diffHunks: [],
          linesAdded: 0,
          linesRemoved: 0,
          isValid: false,
          validationError: `Security violation: Modifying sensitive or excluded file "${relPath}" is prohibited.`,
        });
        continue;
      }

      // Check binary file
      if (ContextExtractor.isBinaryFile(relPath)) {
        changes.push({
          filePath: relPath,
          originalSection: rawChange.originalSection,
          replacementSection: rawChange.replacementSection,
          reason: rawChange.reason,
          expectedEffect: rawChange.expectedEffect,
          diffHunks: [],
          linesAdded: 0,
          linesRemoved: 0,
          isValid: false,
          validationError: `Cannot apply text patch to binary file "${relPath}".`,
        });
        continue;
      }

      const fullPath = path.resolve(repoRoot, relPath);

      let currentFileContent = '';
      let fileExists = false;

      try {
        currentFileContent = await fs.readFile(fullPath, 'utf8');
        fileExists = true;
      } catch {
        // File does not exist yet (create operation)
        fileExists = false;
      }

      // Validate originalSection match
      let isValid = true;
      let validationError: string | undefined;
      let newFullContent = '';

      if (fileExists) {
        if (rawChange.originalSection && rawChange.originalSection.trim().length > 0) {
          // Normalize line endings for reliable matching
          const normCurrent = currentFileContent.replace(/\r\n/g, '\n');
          const normOriginal = rawChange.originalSection.replace(/\r\n/g, '\n');
          const normReplacement = rawChange.replacementSection.replace(/\r\n/g, '\n');

          if (normCurrent.includes(normOriginal)) {
            newFullContent = normCurrent.replace(normOriginal, normReplacement);
          } else {
            isValid = false;
            validationError = `Target original section was not found in "${relPath}". The file may have changed or the match pattern is stale.`;
            newFullContent = currentFileContent;
          }
        } else {
          // Full replacement
          newFullContent = rawChange.replacementSection;
        }
      } else {
        // New file
        newFullContent = rawChange.replacementSection;
      }

      // Compute unified diff hunks
      const patchStr = diff.createTwoFilesPatch(
        `a/${relPath}`,
        `b/${relPath}`,
        currentFileContent,
        newFullContent,
        'original',
        'proposed patch',
        { context: 3 }
      );

      const hunks = patchStr
        .split('\n')
        .filter((l) => l.startsWith('+') || l.startsWith('-') || l.startsWith('@@') || l.startsWith(' '));

      let linesAdded = 0;
      let linesRemoved = 0;

      for (const line of hunks) {
        if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
        if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++;
      }

      changes.push({
        filePath: relPath,
        originalSection: rawChange.originalSection,
        replacementSection: rawChange.replacementSection,
        reason: rawChange.reason,
        expectedEffect: rawChange.expectedEffect,
        diffHunks: hunks,
        linesAdded,
        linesRemoved,
        isValid,
        validationError,
      });
    }

    return {
      id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      taskId,
      summary: llmResult.analysis.proposedSolution,
      changes,
      createdAt: new Date().toISOString(),
    };
  }
}
