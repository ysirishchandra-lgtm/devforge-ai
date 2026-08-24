import { StructuredAnalysisResult, LLMResponseError, LLMPatchChange } from './types';
import { RelevantFileAnalysis } from '@/types';

export class ResponseValidator {
  /**
   * Clean markdown fences and extract pure JSON string
   */
  static extractJsonString(raw: string): string {
    if (!raw || typeof raw !== 'string') {
      throw new LLMResponseError('Empty response received from LLM');
    }

    let cleaned = raw.trim();

    // Check for markdown code blocks (e.g., ```json ... ``` or ``` ...)
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      cleaned = codeBlockMatch[1].trim();
    } else {
      // Find first { and last }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
    }

    return cleaned;
  }

  /**
   * Validate and parse raw LLM output into StructuredAnalysisResult
   */
  static validateAndParse(rawOutput: string): StructuredAnalysisResult {
    const jsonStr = this.extractJsonString(rawOutput);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Syntax error';
      throw new LLMResponseError(`Failed to parse LLM JSON response: ${msg}\nRaw snippet: ${rawOutput.slice(0, 200)}...`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new LLMResponseError('LLM response must be a JSON object');
    }

    // Validate problemUnderstanding
    const problemUnderstanding = typeof parsed.problemUnderstanding === 'string'
      ? parsed.problemUnderstanding.trim()
      : '';
    if (!problemUnderstanding) {
      throw new LLMResponseError('Missing or empty "problemUnderstanding" in LLM analysis');
    }

    // Validate rootCauseHypothesis
    const rootCauseHypothesis = typeof parsed.rootCauseHypothesis === 'string'
      ? parsed.rootCauseHypothesis.trim()
      : '';
    if (!rootCauseHypothesis) {
      throw new LLMResponseError('Missing or empty "rootCauseHypothesis" in LLM analysis');
    }

    // Validate relevantFilesAnalysis
    if (!Array.isArray(parsed.relevantFilesAnalysis)) {
      throw new LLMResponseError('"relevantFilesAnalysis" must be an array of file analyses');
    }

    const relevantFilesAnalysis: RelevantFileAnalysis[] = [];
    for (const item of parsed.relevantFilesAnalysis) {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        const pathStr = typeof itemObj.path === 'string' ? itemObj.path.trim() : '';
        const reason = typeof itemObj.relevanceReason === 'string'
          ? itemObj.relevanceReason.trim()
          : typeof itemObj.reason === 'string'
          ? itemObj.reason.trim()
          : 'Referenced in analysis';

        let action: RelevantFileAnalysis['proposedAction'] = 'inspect';
        if (itemObj.proposedAction === 'modify' || itemObj.proposedAction === 'create' || itemObj.proposedAction === 'none') {
          action = itemObj.proposedAction;
        }

        if (pathStr) {
          relevantFilesAnalysis.push({
            path: pathStr,
            relevanceReason: reason,
            proposedAction: action,
          });
        }
      }
    }

    // Validate proposedSolution
    const proposedSolution = typeof parsed.proposedSolution === 'string'
      ? parsed.proposedSolution.trim()
      : '';
    if (!proposedSolution) {
      throw new LLMResponseError('Missing or empty "proposedSolution" in LLM analysis');
    }

    // Validate implementationSteps
    if (!Array.isArray(parsed.implementationSteps) || parsed.implementationSteps.length === 0) {
      throw new LLMResponseError('"implementationSteps" must be a non-empty array of step descriptions');
    }

    const implementationSteps = parsed.implementationSteps
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim());

    if (implementationSteps.length === 0) {
      throw new LLMResponseError('All items in "implementationSteps" were empty');
    }

    // Validate potentialRisks
    const potentialRisks: string[] = Array.isArray(parsed.potentialRisks)
      ? parsed.potentialRisks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim())
      : ['No specific risks reported'];

    // Validate estimatedComplexity
    let estimatedComplexity: 'simple' | 'moderate' | 'complex' = 'moderate';
    if (parsed.estimatedComplexity === 'simple' || parsed.estimatedComplexity === 'moderate' || parsed.estimatedComplexity === 'complex') {
      estimatedComplexity = parsed.estimatedComplexity;
    }

    // Validate proposedPatchChanges (optional in response, but validated if present)
    const proposedPatchChanges: LLMPatchChange[] = [];
    if (Array.isArray(parsed.proposedPatchChanges)) {
      for (const change of parsed.proposedPatchChanges) {
        if (change && typeof change === 'object') {
          const cObj = change as Record<string, unknown>;
          const filePath = typeof cObj.filePath === 'string'
            ? cObj.filePath.trim()
            : typeof cObj.path === 'string'
            ? cObj.path.trim()
            : '';
          const originalSection = typeof cObj.originalSection === 'string'
            ? cObj.originalSection
            : typeof cObj.originalContent === 'string'
            ? cObj.originalContent
            : typeof cObj.oldContent === 'string'
            ? cObj.oldContent
            : '';
          const replacementSection = typeof cObj.replacementSection === 'string'
            ? cObj.replacementSection
            : typeof cObj.replacementContent === 'string'
            ? cObj.replacementContent
            : typeof cObj.newContent === 'string'
            ? cObj.newContent
            : '';
          const reason = typeof cObj.reason === 'string' ? cObj.reason.trim() : 'Applied targeted patch';
          const expectedEffect = typeof cObj.expectedEffect === 'string' ? cObj.expectedEffect.trim() : 'Fixes identified issue';

          if (filePath && replacementSection) {
            proposedPatchChanges.push({
              filePath,
              originalSection,
              replacementSection,
              reason,
              expectedEffect,
            });
          }
        }
      }
    }

    return {
      problemUnderstanding,
      rootCauseHypothesis,
      relevantFilesAnalysis,
      proposedSolution,
      implementationSteps,
      potentialRisks: potentialRisks.length > 0 ? potentialRisks : ['Standard regression risk; verify with unit tests.'],
      estimatedComplexity,
      proposedPatchChanges: proposedPatchChanges.length > 0 ? proposedPatchChanges : undefined,
    };
  }
}
