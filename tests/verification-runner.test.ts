import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VerificationRunner } from '../src/lib/verification/test-runner';
import * as path from 'path';

describe('VerificationRunner', () => {
  test('should return NOT_CONFIGURED when no commands are provided', async () => {
    const result = await VerificationRunner.run(process.cwd(), []);
    assert.equal(result.overallStatus, 'NOT_CONFIGURED');
    assert.equal(result.results.length, 0);
  });

  test('should successfully execute a valid command', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['node -e "console.log(\'test passed\')"']);
    assert.equal(result.overallStatus, 'PASS');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].command, 'node -e "console.log(\'test passed\')"');
    assert.equal(result.results[0].status, 'PASS');
    assert.equal(result.results[0].exitCode, 0);
    assert.equal(result.results[0].stdout, 'test passed');
  });

  test('should fail when a command returns non-zero exit code', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['node -e "process.exit(1)"']);
    assert.equal(result.overallStatus, 'FAIL');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'FAIL');
    assert.equal(result.results[0].exitCode, 1);
  });

  test('should return NOT_CONFIGURED when a command is missing', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['nonexistentcommand_pytest']);
    assert.equal(result.overallStatus, 'NOT_CONFIGURED');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'NOT_CONFIGURED');
  });

  test('should reject malicious commands', async () => {
    const result = await VerificationRunner.run(process.cwd(), ['echo test && rm -rf /']);
    assert.equal(result.overallStatus, 'FAIL');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'FAIL');
    assert.ok(result.results[0].stderr.includes('Malicious command rejected'));
  });

  test('should execute multiple commands sequentially and pass if all pass', async () => {
    const result = await VerificationRunner.run(process.cwd(), [
      'node -e "console.log(\'cmd 1\')"',
      'node -e "console.log(\'cmd 2\')"'
    ]);
    assert.equal(result.overallStatus, 'PASS');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].status, 'PASS');
    assert.equal(result.results[1].status, 'PASS');
  });

  test('should stop executing multiple commands on first failure', async () => {
    const result = await VerificationRunner.run(process.cwd(), [
      'node -e "console.log(\'cmd 1\')"',
      'node -e "process.exit(1)"',
      'node -e "console.log(\'cmd 3\')"'
    ]);
    assert.equal(result.overallStatus, 'FAIL');
    assert.equal(result.results.length, 2); // Should not reach cmd 3
    assert.equal(result.results[1].status, 'FAIL');
  });
});
