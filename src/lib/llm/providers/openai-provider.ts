import { ILLMProvider } from '../llm-provider.interface';
import { LLMAnalysisRequest, LLMExecutionResult, ConfigurationError, LLMResponseError } from '../types';
import { PromptBuilder } from '../prompt-builder';
import { ResponseValidator } from '../response-validator';
import { getConfig } from '../../config';

export class OpenAIProvider implements ILLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly defaultModel = 'gpt-4o';

  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.openaiApiKey && config.openaiApiKey.trim().length > 0);
  }

  getConfigurationHelp(): string {
    return 'OpenAI requires a valid API key. Please set OPENAI_API_KEY in your .env.local file (get one at https://platform.openai.com/).';
  }

  async analyze(request: LLMAnalysisRequest): Promise<LLMExecutionResult> {
    const config = getConfig();
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.getConfigurationHelp());
    }

    const apiKey = config.openaiApiKey.trim();
    const model = process.env.OPENAI_MODEL || this.defaultModel;
    const url = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = PromptBuilder.buildUserPrompt(request);

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new LLMResponseError(`Network error communicating with OpenAI API: ${msg}`);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      throw new LLMResponseError(`OpenAI API returned HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent) {
      throw new LLMResponseError('OpenAI API returned an empty or missing text response');
    }

    const analysis = ResponseValidator.validateAndParse(textContent);

    return {
      analysis,
      provider: this.name,
      model,
      latencyMs,
      tokensEstimate: {
        promptTokens: data.usage?.prompt_tokens || Math.round(userPrompt.length / 4),
        completionTokens: data.usage?.completion_tokens || Math.round(textContent.length / 4),
      },
    };
  }
}
