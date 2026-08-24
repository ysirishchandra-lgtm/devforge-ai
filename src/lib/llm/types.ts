import { ExtractedFileContext, RelevantFileAnalysis } from '@/types';

export interface LLMAnalysisRequest {
  taskPrompt: string;
  repositoryName: string;
  techStack: string[];
  totalFiles: number;
  filesContext: ExtractedFileContext[];
}

export interface LLMPatchChange {
  filePath: string;
  originalSection: string;
  replacementSection: string;
  reason: string;
  expectedEffect: string;
}

export interface StructuredAnalysisResult {
  problemUnderstanding: string;
  rootCauseHypothesis: string;
  relevantFilesAnalysis: RelevantFileAnalysis[];
  proposedSolution: string;
  implementationSteps: string[];
  potentialRisks: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  proposedPatchChanges?: LLMPatchChange[];
}

export interface LLMExecutionResult {
  analysis: StructuredAnalysisResult;
  provider: string;
  model: string;
  latencyMs: number;
  tokensEstimate?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class LLMResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMResponseError';
  }
}
