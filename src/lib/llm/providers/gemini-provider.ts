import { ILLMProvider } from '../llm-provider.interface';
import { LLMAnalysisRequest, LLMExecutionResult, ConfigurationError, LLMResponseError } from '../types';
import { PromptBuilder } from '../prompt-builder';
import { ResponseValidator } from '../response-validator';
import { getConfig } from '../../config';

export class GeminiProvider implements ILLMProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly defaultModel = 'gemini-3.6-flash';

  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 0);
  }

  getConfigurationHelp(): string {
    return 'Google Gemini requires a valid API key. Please set GEMINI_API_KEY in your .env.local file (get one at https://aistudio.google.com/).';
  }

  async analyze(request: LLMAnalysisRequest): Promise<LLMExecutionResult> {
    const config = getConfig();
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.getConfigurationHelp());
    }

    const apiKey = config.geminiApiKey.trim();
    const model = process.env.GEMINI_MODEL || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = PromptBuilder.buildUserPrompt(request);

    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new LLMResponseError(`Network error communicating with Google Gemini API: ${msg}`);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      throw new LLMResponseError(`Gemini API returned HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new LLMResponseError('Gemini API returned an empty or missing text response');
    }

    const analysis = ResponseValidator.validateAndParse(textContent);

    return {
      analysis,
      provider: this.name,
      model,
      latencyMs,
      tokensEstimate: {
        promptTokens: Math.round(userPrompt.length / 4),
        completionTokens: Math.round(textContent.length / 4),
      },
    };
  }
}
