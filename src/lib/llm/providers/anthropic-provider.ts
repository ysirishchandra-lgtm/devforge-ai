import { ILLMProvider } from '../llm-provider.interface';
import { LLMAnalysisRequest, LLMExecutionResult, ConfigurationError, LLMResponseError } from '../types';
import { PromptBuilder } from '../prompt-builder';
import { ResponseValidator } from '../response-validator';
import { getConfig } from '../../config';

export class AnthropicProvider implements ILLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly defaultModel = 'claude-3-5-sonnet-20241022';

  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.anthropicApiKey && config.anthropicApiKey.trim().length > 0);
  }

  getConfigurationHelp(): string {
    return 'Anthropic Claude requires a valid API key. Please set ANTHROPIC_API_KEY in your .env.local file (get one at https://console.anthropic.com/).';
  }

  async analyze(request: LLMAnalysisRequest): Promise<LLMExecutionResult> {
    const config = getConfig();
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.getConfigurationHelp());
    }

    const apiKey = config.anthropicApiKey.trim();
    const model = process.env.ANTHROPIC_MODEL || this.defaultModel;
    const url = 'https://api.anthropic.com/v1/messages';

    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = PromptBuilder.buildUserPrompt(request);

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new LLMResponseError(`Network error communicating with Anthropic API: ${msg}`);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      throw new LLMResponseError(`Anthropic API returned HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text;

    if (!textContent) {
      throw new LLMResponseError('Anthropic API returned an empty or missing text response');
    }

    const analysis = ResponseValidator.validateAndParse(textContent);

    return {
      analysis,
      provider: this.name,
      model,
      latencyMs,
      tokensEstimate: {
        promptTokens: data.usage?.input_tokens || Math.round(userPrompt.length / 4),
        completionTokens: data.usage?.output_tokens || Math.round(textContent.length / 4),
      },
    };
  }
}
