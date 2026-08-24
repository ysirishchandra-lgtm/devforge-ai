import path from 'path';
import os from 'os';

export interface AppConfig {
  port: number;
  env: string;
  storageDir: string;
  workspacesDir: string;
  aiProvider: 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'mock';
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  ollamaBaseUrl: string;
  githubToken: string;
  autoRunVerification: boolean;
  verificationTimeoutMs: number;
}

export function getConfig(): AppConfig {
  const rootDir = process.cwd();
  
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    storageDir: process.env.DEVFORGE_STORAGE_DIR 
      ? path.resolve(rootDir, process.env.DEVFORGE_STORAGE_DIR)
      : path.join(rootDir, '.devforge_data'),
    workspacesDir: process.env.DEVFORGE_WORKSPACES_DIR
      ? path.resolve(rootDir, process.env.DEVFORGE_WORKSPACES_DIR)
      : path.join(rootDir, 'temp_repos'),
    aiProvider: (process.env.AI_PROVIDER as AppConfig['aiProvider']) || 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    githubToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
    autoRunVerification: process.env.AUTO_RUN_VERIFICATION !== 'false',
    verificationTimeoutMs: parseInt(process.env.VERIFICATION_TIMEOUT_MS || '60000', 10),
  };
}

export function getSafeConfigSummary() {
  const cfg = getConfig();
  return {
    aiProvider: cfg.aiProvider,
    hasGeminiKey: Boolean(cfg.geminiApiKey && cfg.geminiApiKey.trim().length > 0),
    hasOpenAIKey: Boolean(cfg.openaiApiKey && cfg.openaiApiKey.trim().length > 0),
    hasAnthropicKey: Boolean(cfg.anthropicApiKey && cfg.anthropicApiKey.trim().length > 0),
    hasGithubToken: Boolean(cfg.githubToken && cfg.githubToken.trim().length > 0),
    autoRunVerification: cfg.autoRunVerification,
    verificationTimeoutMs: cfg.verificationTimeoutMs,
    storageDir: cfg.storageDir,
    workspacesDir: cfg.workspacesDir,
    platform: `${os.platform()} (${os.arch()})`,
    nodeVersion: process.version,
  };
}
