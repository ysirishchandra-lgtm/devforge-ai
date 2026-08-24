import { exec } from 'child_process';
import { VerificationResult } from '@/types';
import { getConfig } from '../config';

export class VerificationRunner {
  /**
   * Execute real verification commands (tests, builds, type-checks) in the target repo
   */
  static async run(
    workingDir: string,
    commandToRun?: string
  ): Promise<VerificationResult> {
    const config = getConfig();
    const command = commandToRun || 'npm test';
    const timeout = config.verificationTimeoutMs;
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
          const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          const passed = exitCode === 0;

          // Parse test metrics from stdout if possible
          const testSummary = this.parseTestOutput(stdout + '\n' + stderr);

          resolve({
            command,
            workingDir,
            exitCode,
            passed,
            durationMs,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            testSummary,
            ranAt: new Date().toISOString(),
          });
        }
      );

      // Handle process error event
      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          command,
          workingDir,
          exitCode: 1,
          passed: false,
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
