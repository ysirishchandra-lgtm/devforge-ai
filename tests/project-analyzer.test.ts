import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { ProjectAnalyzer } from '../src/lib/analyzer/project-analyzer';

describe('ProjectAnalyzer Tests', () => {
  test('analyze maps current repository structure and detects tech stack', async () => {
    const cwd = process.cwd();
    const structure = await ProjectAnalyzer.analyze(cwd);

    assert.ok(structure.totalFiles > 0);
    assert.ok(structure.totalDirectories > 0);
    assert.ok(structure.detectedLanguages.includes('TypeScript'));
    assert.ok(structure.detectedFrameworks.includes('Next.js'));
    assert.ok(structure.detectedFrameworks.includes('React'));
    assert.ok(structure.fileTree.length > 0);
  });

  test('findRelevantFiles scores and ranks files matching query keywords', async () => {
    const cwd = process.cwd();
    const structure = await ProjectAnalyzer.analyze(cwd);

    const relevant = await ProjectAnalyzer.findRelevantFiles(
      cwd,
      'orchestrator and task execution pipeline',
      structure.fileTree
    );

    assert.ok(relevant.length > 0);
    // Should score orchestrator.ts or agent files near the top
    const orchestratorMatch = relevant.find((f) => f.path.includes('orchestrator'));
    assert.ok(orchestratorMatch);
    assert.ok(orchestratorMatch.relevanceScore > 0);
  });
});
