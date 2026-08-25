export type TaskStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'patch_ready'
  | 'awaiting_approval'
  | 'applying'
  | 'applied'
  | 'verifying'
  | 'completed'
  | 'rejected'
  | 'failed';

export type StageId =
  | 'structure_analysis'
  | 'file_identification'
  | 'context_collection'
  | 'ai_analysis'
  | 'patch_generation'
  | 'approval_and_apply'
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

export interface RelevantFileAnalysis {
  path: string;
  relevanceReason: string;
  proposedAction: 'modify' | 'create' | 'inspect' | 'none';
}

export interface SolutionPlan {
  problemUnderstanding: string;
  rootCauseHypothesis: string;
  relevantFilesAnalysis: RelevantFileAnalysis[];
  proposedSolution: string;
  implementationSteps: string[];
  potentialRisks: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  contextSummary?: {
    filesCount: number;
    totalBytes: number;
    approximateTokens: number;
  };
  llmProvider?: string;
  llmModel?: string;
  llmLatencyMs?: number;
}

export interface PatchFileChange {
  filePath: string;
  originalSection: string;
  replacementSection: string;
  reason: string;
  expectedEffect: string;
  diffHunks: string[];
  linesAdded: number;
  linesRemoved: number;
  isValid: boolean;
  validationError?: string;
}

export interface PatchProposal {
  id: string;
  taskId: string;
  summary: string;
  changes: PatchFileChange[];
  createdAt: string;
  appliedAt?: string;
  rejectedAt?: string;
  backupId?: string;
  modifiedFiles?: string[];
}

export type VerificationStatus = 'PASS' | 'FAIL' | 'NOT_CONFIGURED' | 'TIMEOUT';

export interface CommandVerificationResult {
  command: string;
  workingDir: string;
  status: VerificationStatus;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  testSummary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  summary?: string;
  ranAt: string;
}

export interface VerificationResult {
  overallStatus: VerificationStatus;
  results: CommandVerificationResult[];
  ranAt: string;
}

export interface ExtractedFileContext {
  path: string;
  language: string;
  sizeBytes: number;
  content: string;
  isTruncated: boolean;
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
  extractedContext?: ExtractedFileContext[];
  plan?: SolutionPlan;
  patchProposal?: PatchProposal;
  verification?: VerificationResult;
  verificationHistory?: VerificationResult[];
  backupId?: string;
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
  verificationCommands: string[];
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
