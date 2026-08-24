import { exec } from 'child_process';
import { VerificationResult, CommandVerificationResult, VerificationStatus } from '@/types';
import { getConfig } from '../config';

export class VerificationRunner {
  /**
   * Check if a command is safe to execute by preventing shell injections.
   */
  private static isCommandSafe(command: string): boolean {
    const maliciousPatterns = /[;&|<>$`]/;
    return !maliciousPatterns.test(command);
  }

  /**
   * Execute real verification commands (tests, builds, type-checks) in the target repo
   */
  static async run(
    workingDir: string,
    commands: string[]
  ): Promise<VerificationResult> {
    if (!commands || commands.length === 0) {
      return {
        overallStatus: 'NOT_CONFIGURED',
        results: [],
        ranAt: new Date().toISOString(),
      };
    }

    const results: CommandVerificationResult[] = [];
    let overallStatus: VerificationStatus = 'PASS';

    for (const command of commands) {
      if (!this.isCommandSafe(command)) {
        results.push({
          command,
          workingDir,
          status: 'FAIL',
          exitCode: 1,
          durationMs: 0,
          stdout: '',
          stderr: 'Execution failed: Malicious command rejected',
          ranAt: new Date().toISOString(),
        });
        overallStatus = 'FAIL';
        break; // Stop running further commands
      }

      const result = await this.runSingleCommand(workingDir, command);
      results.push(result);

      if (result.status === 'FAIL') {
        overallStatus = 'FAIL';
        break; // Stop on first failure
      } else if (result.status === 'TIMEOUT') {
        overallStatus = 'TIMEOUT';
        break;
      } else if (result.status === 'NOT_CONFIGURED') {
        overallStatus = 'NOT_CONFIGURED';
        // We don't break immediately, or maybe we do? A missing command usually means the environment isn't set up.
        // It's safer to break.
        break;
      }
    }

    return {
      overallStatus,
      results,
      ranAt: new Date().toISOString(),
    };
  }

  private static async runSingleCommand(
    workingDir: string,
    command: string
  ): Promise<CommandVerificationResult> {
    const config = getConfig();
    const timeout = config.verificationTimeoutMs || 30000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = exec(
        command,
        {
          cwd: workingDir,
          timeout,
          env: {
            ...process.env,
            CI: 'true',
            FORCE_COLOR: '0',
          },
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          let status: VerificationStatus = 'PASS';
          let exitCode = 0;

          if (error) {
            if (error.signal === 'SIGTERM' || error.killed) {
              status = 'TIMEOUT';
              exitCode = 143;
            } else if (
              error.code === 127 ||
              (error.code === 1 && stderr.toLowerCase().includes('is not recognized')) ||
              (error.code === 1 && stderr.toLowerCase().includes('command not found')) ||
              (error.code === 1 && stdout.toLowerCase().includes('is not recognized'))
            ) {
              status = 'NOT_CONFIGURED';
              exitCode = typeof error.code === 'number' ? error.code : 1;
            } else {
              status = 'FAIL';
              exitCode = typeof error.code === 'number' ? error.code : 1;
            }
          }

          // Parse test metrics from stdout if possible
          const testSummary = this.parseTestOutput(stdout + '\n' + stderr);

          resolve({
            command,
            workingDir,
            status,
            exitCode,
            durationMs,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            testSummary,
            ranAt: new Date().toISOString(),
          });
        }
      );

      // Handle process error event (e.g. command not found)
      proc.on('error', (err: any) => {
        const durationMs = Date.now() - startTime;
        let status: VerificationStatus = 'FAIL';
        if (err.code === 'ENOENT') {
          status = 'NOT_CONFIGURED';
        }
        resolve({
          command,
          workingDir,
          status,
          exitCode: 1,
          durationMs,
          stdout: '',
          stderr: `Execution failed: ${err.message}`,
          ranAt: new Date().toISOString(),
        });
      });
    });
  }

  /**
   * Parse common test runner outputs (Jest, Vitest, Pytest, Go test)
   */
  private static parseTestOutput(output: string): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  } | undefined {
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let detected = false;

    // Jest / Vitest pattern: Tests: 2 failed, 10 passed, 12 total
    const jestTestsMatch = output.match(/Tests:\s+([^\n]+)/i);
    if (jestTestsMatch) {
      detected = true;
      const part = jestTestsMatch[1];
      const passedMatch = part.match(/(\d+)\s+passed/i);
      const failedMatch = part.match(/(\d+)\s+failed/i);
      const skippedMatch = part.match(/(\d+)\s+skipped/i);
      const totalMatch = part.match(/(\d+)\s+total/i);

      if (passedMatch) passed = parseInt(passedMatch[1], 10);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
      if (totalMatch) total = parseInt(totalMatch[1], 10);
      else total = passed + failed + skipped;
    }

    // Pytest pattern: 2 failed, 10 passed in 0.5s
    const pytestMatch = output.match(/=+\s+(.*?)\s+in\s+[\d\.]+s\s+=+/i);
    if (!detected && pytestMatch) {
      detected = true;
      const part = pytestMatch[1];
      const passedMatch = part.match(/(\d+)\s+passed/i);
      const failedMatch = part.match(/(\d+)\s+failed/i);
      const skippedMatch = part.match(/(\d+)\s+skipped/i);

      if (passedMatch) passed = parseInt(passedMatch[1], 10);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
      total = passed + failed + skipped;
    }

    if (detected && total > 0) {
      return { total, passed, failed, skipped };
    }

    return undefined;
  }
}
