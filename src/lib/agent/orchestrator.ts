import { TaskRun, TaskStage, LogEntry, RelevantFile, SolutionPlan, ExtractedFileContext, PatchProposal } from '@/types';
import { ProjectAnalyzer } from '../analyzer/project-analyzer';
import { ContextExtractor } from '../analyzer/context-extractor';
import { LLMProviderFactory } from '../llm/provider-factory';
import { PatchGenerator } from '../patch/patch-generator';
import { PatchEngine } from '../patch/patch-engine';
import { VerificationRunner } from '../verification/test-runner';
import { AppStore } from '../storage/store';
import { getConfig } from '../config';

export class AgentOrchestrator {
  private static createLog(
    stage: TaskStage['id'] | 'system',
    level: LogEntry['level'],
    message: string,
    details?: Record<string, unknown> | string
  ): LogEntry {
    return {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      stage,
      level,
      message,
      details,
    };
  }

  /**
   * Stage 1 to 5: Run analysis, reasoning, and generate patch proposal (Awaiting Developer Approval)
   */
  static async runTask(
    taskId: string,
    onProgress?: (task: TaskRun) => void
  ): Promise<TaskRun> {
    const task = await AppStore.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const repo = await AppStore.getRepositoryById(task.repositoryId);
    if (!repo) {
      throw new Error(`Repository ${task.repositoryId} not found`);
    }

    const appendLog = async (
      stageId: TaskStage['id'] | 'system',
      level: LogEntry['level'],
      message: string,
      details?: Record<string, unknown> | string
    ) => {
      const log = this.createLog(stageId, level, message, details);
      task.logs.push(log);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
    };

    const updateStage = async (
      stageIndex: number,
      status: TaskStage['status'],
      summary?: string
    ) => {
      task.currentStageIndex = stageIndex;
      const stage = task.stages[stageIndex];
      if (stage) {
        stage.status = status;
        if (status === 'running') stage.startedAt = new Date().toISOString();
        if (status === 'completed' || status === 'failed') stage.completedAt = new Date().toISOString();
        if (summary) stage.summary = summary;
      }
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
    };

    try {
      task.status = 'analyzing';
      await appendLog('system', 'info', `🚀 Initiating DevForge Agent for task: "${task.title}"`);
      await appendLog('system', 'info', `Target repository: ${repo.name} (${repo.localPath})`);

      // STAGE 1: Structure Analysis
      await updateStage(0, 'running');
      await appendLog('structure_analysis', 'info', 'Scanning workspace filesystem and analyzing architecture...');

      const structure = await ProjectAnalyzer.analyze(repo.localPath);
      await appendLog(
        'structure_analysis',
        'success',
        `Discovered ${structure.totalFiles} files across ${structure.totalDirectories} directories.`,
        {
          languages: structure.detectedLanguages,
          frameworks: structure.detectedFrameworks,
        }
      );
      await updateStage(
        0,
        'completed',
        `Mapped ${structure.totalFiles} files. Tech stack: ${structure.detectedLanguages.join(', ')}`
      );

      // STAGE 2: File Identification
      await updateStage(1, 'running');
      await appendLog('file_identification', 'info', `Searching for files relevant to: "${task.prompt}"...`);

      const relevantFiles: RelevantFile[] = await ProjectAnalyzer.findRelevantFiles(
        repo.localPath,
        task.prompt,
        structure.fileTree
      );

      task.relevantFiles = relevantFiles;
      if (relevantFiles.length > 0) {
        await appendLog(
          'file_identification',
          'success',
          `Identified ${relevantFiles.length} candidate files: ${relevantFiles.map((f) => f.path).join(', ')}`
        );
      } else {
        await appendLog(
          'file_identification',
          'info',
          'No direct filename matches found. Will provide top-level architecture context.'
        );
      }
      await updateStage(
        1,
        'completed',
        `Ranked ${relevantFiles.length} target files for diagnostic analysis.`
      );

      // STAGE 3: Safe Context Collection
      await updateStage(2, 'running');
      await appendLog('context_collection', 'info', 'Extracting safe source context (filtering secrets, .env files, and binary assets)...');

      const extractedContext: ExtractedFileContext[] = await ContextExtractor.extractSafeContext(
        repo.localPath,
        relevantFiles,
        { maxFiles: 6, maxFileBytes: 25 * 1024, maxTotalBytes: 80 * 1024 }
      );

      task.extractedContext = extractedContext;
      const totalContextBytes = extractedContext.reduce((acc, f) => acc + f.content.length, 0);

      await appendLog(
        'context_collection',
        'success',
        `Extracted ${extractedContext.length} safe file contexts (${Math.round(totalContextBytes / 1024)} KB total).`
      );
      await updateStage(
        2,
        'completed',
        `Collected ${extractedContext.length} safe context files.`
      );

      // STAGE 4: AI Analysis & LLM Reasoning
      task.status = 'planning';
      await updateStage(3, 'running');

      const provider = LLMProviderFactory.getActiveProvider();
      await appendLog('ai_analysis', 'info', `Dispatching context to ${provider.name} (${provider.defaultModel})...`);

      if (!provider.isConfigured()) {
        const helpMessage = provider.getConfigurationHelp();
        await appendLog('ai_analysis', 'error', `⚠️ Provider Configuration Missing: ${helpMessage}`);
        throw new Error(`LLM provider "${provider.name}" is not configured. ${helpMessage}`);
      }

      const llmResult = await provider.analyze({
        taskPrompt: task.prompt,
        repositoryName: repo.name,
        techStack: structure.detectedLanguages,
        totalFiles: structure.totalFiles,
        filesContext: extractedContext,
      });

      await appendLog(
        'ai_analysis',
        'success',
        `Received structured AI diagnosis from ${llmResult.provider} (${llmResult.model}) in ${llmResult.latencyMs}ms.`
      );
      await updateStage(
        3,
        'completed',
        `AI reasoning completed in ${llmResult.latencyMs}ms.`
      );

      // STAGE 5: Solution Plan & Patch Proposal Generation
      await updateStage(4, 'running');
      await appendLog('patch_generation', 'info', 'Computing targeted code patch and calculating unified diffs...');

      const plan: SolutionPlan = {
        problemUnderstanding: llmResult.analysis.problemUnderstanding,
        rootCauseHypothesis: llmResult.analysis.rootCauseHypothesis,
        relevantFilesAnalysis: llmResult.analysis.relevantFilesAnalysis,
        proposedSolution: llmResult.analysis.proposedSolution,
        implementationSteps: llmResult.analysis.implementationSteps,
        potentialRisks: llmResult.analysis.potentialRisks,
        estimatedComplexity: llmResult.analysis.estimatedComplexity,
        contextSummary: {
          filesCount: extractedContext.length,
          totalBytes: totalContextBytes,
          approximateTokens: Math.round(totalContextBytes / 4),
        },
        llmProvider: llmResult.provider,
        llmModel: llmResult.model,
        llmLatencyMs: llmResult.latencyMs,
      };
      task.plan = plan;

      const patchProposal = await PatchGenerator.generateProposal(
        task.id,
        repo.localPath,
        llmResult,
        extractedContext
      );
      task.patchProposal = patchProposal;

      await appendLog(
        'patch_generation',
        'success',
        `Generated patch proposal across ${patchProposal.changes.length} files. All target files untouched pending review.`
      );
      await updateStage(
        4,
        'completed',
        `Patch proposal ready (${patchProposal.changes.length} files). Awaiting developer approval.`
      );

      // STOP HERE: Set status to patch_ready / awaiting_approval
      task.status = 'patch_ready';
      await appendLog('system', 'warn', '⏸️ Workflow paused: Developer review and approval required before applying changes.');

      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      task.status = 'failed';
      task.errorMessage = errorMsg;
      task.completedAt = new Date().toISOString();
      await appendLog('system', 'error', `❌ ${errorMsg}`);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    }
  }

  /**
   * Developer explicitly approves the proposed patch: Applies changes and runs verification
   */
  static async approveAndApply(
    taskId: string,
    onProgress?: (task: TaskRun) => void
  ): Promise<TaskRun> {
    const task = await AppStore.getTaskById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const repo = await AppStore.getRepositoryById(task.repositoryId);
    if (!repo) throw new Error(`Repository ${task.repositoryId} not found`);

    if (!task.patchProposal || task.patchProposal.changes.length === 0) {
      throw new Error('No patch proposal available for this task.');
    }

    const appendLog = async (
      stageId: TaskStage['id'] | 'system',
      level: LogEntry['level'],
      message: string,
      details?: Record<string, unknown> | string
    ) => {
      const log = this.createLog(stageId, level, message, details);
      task.logs.push(log);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
    };

    const updateStage = async (
      stageIndex: number,
      status: TaskStage['status'],
      summary?: string
    ) => {
      task.currentStageIndex = stageIndex;
      const stage = task.stages[stageIndex];
      if (stage) {
        stage.status = status;
        if (status === 'running') stage.startedAt = new Date().toISOString();
        if (status === 'completed' || status === 'failed') stage.completedAt = new Date().toISOString();
        if (summary) stage.summary = summary;
      }
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
    };

    try {
      task.status = 'applying';
      await updateStage(5, 'running');
      await appendLog('approval_and_apply', 'info', 'Developer approved patch. Applying changes to repository...');

      const applyResult = await PatchEngine.applyPatch(repo.localPath, task.patchProposal);

      if (!applyResult.success) {
        throw new Error(applyResult.error || 'Failed to apply patch');
      }

      task.backupId = applyResult.backupId;
      task.status = 'applied';
      await appendLog(
        'approval_and_apply',
        'success',
        `Successfully applied patch to ${applyResult.modifiedFiles.length} files: ${applyResult.modifiedFiles.join(', ')}. Snapshot backup: ${applyResult.backupId}`
      );
      await updateStage(5, 'completed', `Applied patch to ${applyResult.modifiedFiles.length} files.`);

      // STAGE 6: Verification
      task.status = 'verifying';
      await updateStage(6, 'running');

      const structure = await ProjectAnalyzer.analyze(repo.localPath);
      const commands = structure.verificationCommands && structure.verificationCommands.length > 0 
        ? structure.verificationCommands 
        : ['npm test'];
      await appendLog('verification', 'info', `Executing verification commands: ${commands.join(', ')} in ${repo.localPath}...`);

      const config = getConfig();
      if (config.autoRunVerification) {
        const verification = await VerificationRunner.run(repo.localPath, commands);
        task.verification = verification;

        if (verification.overallStatus === 'PASS') {
          const totalDuration = verification.results.reduce((acc, r) => acc + r.durationMs, 0);
          await appendLog('verification', 'success', `✅ All verifications passed in ${totalDuration}ms.`);
          await updateStage(6, 'completed', `Verification PASSED in ${totalDuration}ms`);
        } else if (verification.overallStatus === 'TIMEOUT') {
          await appendLog('verification', 'error', `⏰ Verification timed out.`);
          await updateStage(6, 'failed', `Verification TIMEOUT`);
        } else {
          const failedCmd = verification.results.find(r => r.status === 'FAIL');
          await appendLog('verification', 'warn', `⚠️ Verification failed on command: ${failedCmd?.command} (Exit code ${failedCmd?.exitCode}).`);
          await updateStage(6, 'completed', `Verification FAILED on ${failedCmd?.command}`);
        }
      } else {
        await updateStage(6, 'skipped', 'Automated verification skipped by configuration.');
      }

      // Complete
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      await updateStage(7, 'completed', 'Workflow completed with full audit trail.');
      await appendLog('summary', 'success', '🎉 DevForge task completed successfully.');

      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      task.status = 'failed';
      task.errorMessage = errorMsg;
      await appendLog('system', 'error', `❌ Application failed: ${errorMsg}`);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    }
  }

  /**
   * Developer rejects the proposed patch: Repository remains 100% untouched
   */
  static async rejectTask(
    taskId: string,
    onProgress?: (task: TaskRun) => void
  ): Promise<TaskRun> {
    const task = await AppStore.getTaskById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'rejected';
    task.completedAt = new Date().toISOString();

    const log = this.createLog('system', 'warn', '🛑 Patch proposal was rejected by developer. Repository files remain completely untouched.');
    task.logs.push(log);

    if (task.patchProposal) {
      task.patchProposal.rejectedAt = new Date().toISOString();
    }

    await AppStore.saveTask(task);
    if (onProgress) onProgress(task);
    return task;
  }

  /**
   * Run verification again (Retry) safely
   */
  static async retryVerification(
    taskId: string,
    onProgress?: (task: TaskRun) => void
  ): Promise<TaskRun> {
    const task = await AppStore.getTaskById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    if (task.status !== 'completed' && task.status !== 'verifying' && task.status !== 'applied') {
      throw new Error(`Cannot retry verification for task in state: ${task.status}`);
    }

    const repo = await AppStore.getRepositoryById(task.repositoryId);
    if (!repo) throw new Error(`Repository ${task.repositoryId} not found`);

    const appendLog = async (
      stageId: TaskStage['id'] | 'system',
      level: LogEntry['level'],
      message: string,
      details?: Record<string, unknown> | string
    ) => {
      const log = this.createLog(stageId, level, message, details);
      task.logs.push(log);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
    };

    try {
      // Archive existing verification
      if (task.verification) {
        if (!task.verificationHistory) {
          task.verificationHistory = [];
        }
        task.verificationHistory.unshift(task.verification); // push latest to history
        // Bound history to 10
        if (task.verificationHistory.length > 10) {
          task.verificationHistory = task.verificationHistory.slice(0, 10);
        }
      }

      await appendLog('verification', 'info', '🔄 Retrying verification...');

      const structure = await ProjectAnalyzer.analyze(repo.localPath);
      const commands = structure.verificationCommands && structure.verificationCommands.length > 0 
        ? structure.verificationCommands 
        : ['npm test'];
      
      const verification = await VerificationRunner.run(repo.localPath, commands);
      task.verification = verification;

      if (verification.overallStatus === 'PASS') {
        const totalDuration = verification.results.reduce((acc, r) => acc + r.durationMs, 0);
        await appendLog('verification', 'success', `✅ All verifications passed in ${totalDuration}ms.`);
      } else if (verification.overallStatus === 'TIMEOUT') {
        await appendLog('verification', 'error', `⏰ Verification timed out.`);
      } else {
        const failedCmd = verification.results.find(r => r.status === 'FAIL' || r.status === 'NOT_CONFIGURED');
        await appendLog('verification', 'warn', `⚠️ Verification failed on command: ${failedCmd?.command} (Exit code ${failedCmd?.exitCode}).`);
      }

      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await appendLog('system', 'error', `❌ Retry failed: ${errorMsg}`);
      await AppStore.saveTask(task);
      if (onProgress) onProgress(task);
      return task;
    }
  }
}
