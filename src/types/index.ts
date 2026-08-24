export type TaskStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'modifying'
  | 'verifying'
  | 'completed'
  | 'failed';

export type StageId =
  | 'structure_analysis'
  | 'file_identification'
  | 'solution_plan'
  | 'code_modification'
  | 'verification'
  | 'summary';

export interface TaskStage {
  id: StageId;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  summary?: string;
}

export interface RelevantFile {
  path: string;
  relevanceScore: number; // 0 to 100
  reason: string;
  language?: string;
  sizeBytes?: number;
}

export interface SolutionPlan {
  summary: string;
  problemExplanation: string;
  steps: string[];
  affectedModules: string[];
  riskAssessment: 'low' | 'medium' | 'high';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
}

export interface FileChange {
  path: string;
  changeType: 'modify' | 'create' | 'delete';
  oldContent?: string;
  newContent?: string;
  diffHunks: string[];
  linesAdded: number;
  linesRemoved: number;
}

export interface VerificationResult {
  command: string;
  workingDir: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  testSummary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  ranAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  stage: StageId | 'system';
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown> | string;
}

export interface TaskRun {
  id: string;
  title: string;
  prompt: string;
  repositoryId: string;
  status: TaskStatus;
  currentStageIndex: number;
  stages: TaskStage[];
  relevantFiles: RelevantFile[];
  plan?: SolutionPlan;
  changes: FileChange[];
  verification?: VerificationResult;
  logs: LogEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  extension?: string;
  children?: FileNode[];
}

export interface ProjectStructure {
  rootPath: string;
  totalFiles: number;
  totalDirectories: number;
  detectedLanguages: string[];
  detectedFrameworks: string[];
  testCommand?: string;
  buildCommand?: string;
  entrypoints: string[];
  configFiles: string[];
  fileTree: FileNode[];
}

export interface Repository {
  id: string;
  name: string;
  localPath: string;
  remoteUrl?: string;
  branch: string;
  isClean: boolean;
  totalFiles: number;
  detectedStack: string[];
  lastScannedAt: string;
  isCloned: boolean;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error';
  version: string;
  gitVersion: string;
  nodeVersion: string;
  osPlatform: string;
  storageDir: string;
  aiProvider: string;
  hasGeminiKey: boolean;
  hasOpenAIKey: boolean;
  hasAnthropicKey: boolean;
  hasGithubToken: boolean;
  timestamp: string;
}

export interface SystemConfig {
  aiProvider: 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'mock';
  geminiApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  githubToken?: string;
  autoRunVerification: boolean;
  verificationTimeoutMs: number;
}
