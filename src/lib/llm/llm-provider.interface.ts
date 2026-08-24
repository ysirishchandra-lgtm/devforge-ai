import { LLMAnalysisRequest, LLMExecutionResult } from './types';

export interface ILLMProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultModel: string;

  /**
   * Check whether this provider has required credentials/configuration in the environment
   */
  isConfigured(): boolean;

  /**
   * Return human-friendly error message if not configured
   */
  getConfigurationHelp(): string;

  /**
   * Execute structured analysis on repository context
   */
  analyze(request: LLMAnalysisRequest): Promise<LLMExecutionResult>;
}
