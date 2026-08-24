import { ILLMProvider } from '../llm-provider.interface';
import { LLMAnalysisRequest, LLMExecutionResult, ConfigurationError, LLMResponseError } from '../types';
import { PromptBuilder } from '../prompt-builder';
import { ResponseValidator } from '../response-validator';
import { getConfig } from '../../config';

export class OllamaProvider implements ILLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local LLM)';
  readonly defaultModel = 'qwen2.5-coder';

  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.ollamaBaseUrl && config.ollamaBaseUrl.trim().length > 0);
  }

  getConfigurationHelp(): string {
    return 'Ollama requires a running local instance. Ensure Ollama is running at http://localhost:11434 (or configure OLLAMA_BASE_URL).';
  }

  async analyze(request: LLMAnalysisRequest): Promise<LLMExecutionResult> {
    const config = getConfig();
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.getConfigurationHelp());
    }

    const baseUrl = config.ollamaBaseUrl.replace(/\/+$/, '');
    const model = process.env.OLLAMA_MODEL || this.defaultModel;
    const url = `${baseUrl}/api/chat`;

    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = PromptBuilder.buildUserPrompt(request);

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new LLMResponseError(`Cannot connect to local Ollama server at ${url}: ${msg}. Is Ollama running?`);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      throw new LLMResponseError(`Ollama returned HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.message?.content;

    if (!textContent) {
      throw new LLMResponseError('Ollama returned an empty response message');
    }

    const analysis = ResponseValidator.validateAndParse(textContent);

    return {
      analysis,
      provider: this.name,
      model,
      latencyMs,
      tokensEstimate: {
        promptTokens: data.prompt_eval_count || Math.round(userPrompt.length / 4),
        completionTokens: data.eval_count || Math.round(textContent.length / 4),
      },
    };
  }
}
