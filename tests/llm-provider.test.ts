import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LLMProviderFactory } from '../src/lib/llm/provider-factory';
import { ConfigurationError } from '../src/lib/llm/types';

describe('LLMProvider & Factory Tests', () => {
  test('factory resolves known providers', () => {
    const gemini = LLMProviderFactory.getProvider('gemini');
    assert.ok(gemini);
    assert.strictEqual(gemini.name, 'Google Gemini');

    const openai = LLMProviderFactory.getProvider('openai');
    assert.ok(openai);
    assert.strictEqual(openai.name, 'OpenAI');

    const anthropic = LLMProviderFactory.getProvider('anthropic');
    assert.ok(anthropic);
    assert.strictEqual(anthropic.name, 'Anthropic Claude');

    const ollama = LLMProviderFactory.getProvider('ollama');
    assert.ok(ollama);
    assert.strictEqual(ollama.name, 'Ollama (Local LLM)');
  });

  test('getActiveProvider returns provider matching environment', () => {
    const active = LLMProviderFactory.getActiveProvider();
    assert.ok(active);
    assert.ok(['gemini', 'openai', 'anthropic', 'ollama'].includes(active.id));
  });

  test('unconfigured provider reports false for isConfigured and throws ConfigurationError on analyze', async () => {
    const gemini = LLMProviderFactory.getProvider('gemini');
    assert.ok(gemini);

    // If no key in environment, analyze should reject with ConfigurationError
    if (!gemini.isConfigured()) {
      await assert.rejects(
        async () => {
          await gemini.analyze({
            taskPrompt: 'Fix login',
            repositoryName: 'test-repo',
            techStack: ['TypeScript'],
            totalFiles: 10,
            filesContext: [],
          });
        },
        (err: unknown) => {
          return err instanceof ConfigurationError && err.message.includes('GEMINI_API_KEY');
        }
      );
    }
  });

  test('getProvidersStatus returns telemetry without leaking secret keys', () => {
    const statuses = LLMProviderFactory.getProvidersStatus();
    assert.strictEqual(statuses.length, 4);

    for (const status of statuses) {
      assert.ok(typeof status.id === 'string');
      assert.ok(typeof status.name === 'string');
      assert.ok(typeof status.isConfigured === 'boolean');
      assert.ok(typeof status.isActive === 'boolean');
      // Verify no key property is exposed
      assert.strictEqual((status as unknown as Record<string, unknown>).apiKey, undefined);
    }
  });
});
