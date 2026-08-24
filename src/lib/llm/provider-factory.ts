import { ILLMProvider } from './llm-provider.interface';
import { GeminiProvider } from './providers/gemini-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OllamaProvider } from './providers/ollama-provider';
import { ConfigurationError } from './types';
import { getConfig } from '../config';

export class LLMProviderFactory {
  private static providers: Map<string, ILLMProvider> = new Map<string, ILLMProvider>([
    ['gemini', new GeminiProvider()],
    ['openai', new OpenAIProvider()],
    ['anthropic', new AnthropicProvider()],
    ['ollama', new OllamaProvider()],
  ]);

  /**
   * Get the currently active provider based on environment config
   */
  static getActiveProvider(): ILLMProvider {
    const config = getConfig();
    const providerId = (config.aiProvider || 'gemini').toLowerCase();

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ConfigurationError(
        `Unknown AI_PROVIDER "${providerId}". Supported providers are: gemini, openai, anthropic, ollama.`
      );
    }

    return provider;
  }

  /**
   * Get a specific provider by ID
   */
  static getProvider(providerId: string): ILLMProvider | undefined {
    return this.providers.get(providerId.toLowerCase());
  }

  /**
   * List all supported providers and their readiness status
   */
  static getProvidersStatus(): Array<{
    id: string;
    name: string;
    defaultModel: string;
    isConfigured: boolean;
    isActive: boolean;
  }> {
    const config = getConfig();
    const activeId = (config.aiProvider || 'gemini').toLowerCase();

    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      defaultModel: p.defaultModel,
      isConfigured: p.isConfigured(),
      isActive: p.id === activeId,
    }));
  }
}
