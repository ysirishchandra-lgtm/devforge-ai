import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseValidator } from '../src/lib/llm/response-validator';
import { LLMResponseError } from '../src/lib/llm/types';

describe('ResponseValidator Structured Output Tests', () => {
  test('validates and parses pure JSON response', () => {
    const validJson = JSON.stringify({
      problemUnderstanding: 'The login button handler does not prevent default form submission.',
      rootCauseHypothesis: 'Missing e.preventDefault() in onSubmit callback in src/auth/login.tsx.',
      relevantFilesAnalysis: [
        {
          path: 'src/auth/login.tsx',
          relevanceReason: 'Contains form submit handler and button component.',
          proposedAction: 'modify',
        },
      ],
      proposedSolution: 'Add e.preventDefault() and attach async authentication dispatch.',
      implementationSteps: [
        'Open src/auth/login.tsx',
        'Update handleSubmit to accept event and call e.preventDefault()',
        'Verify form submission no longer triggers full page reload',
      ],
      potentialRisks: ['Ensure error states are displayed inline.'],
      estimatedComplexity: 'simple',
    });

    const result = ResponseValidator.validateAndParse(validJson);

    assert.strictEqual(result.problemUnderstanding, 'The login button handler does not prevent default form submission.');
    assert.strictEqual(result.rootCauseHypothesis, 'Missing e.preventDefault() in onSubmit callback in src/auth/login.tsx.');
    assert.strictEqual(result.relevantFilesAnalysis.length, 1);
    assert.strictEqual(result.relevantFilesAnalysis[0].proposedAction, 'modify');
    assert.strictEqual(result.implementationSteps.length, 3);
    assert.strictEqual(result.estimatedComplexity, 'simple');
  });

  test('extracts and parses JSON wrapped in markdown code fences', () => {
    const fencedJson = `
Here is the structured solution plan:

\`\`\`json
{
  "problemUnderstanding": "API route lacks payload validation",
  "rootCauseHypothesis": "POST body is read directly without schema check",
  "relevantFilesAnalysis": [
    {
      "path": "src/app/api/tasks/route.ts",
      "relevanceReason": "Route handler missing validation",
      "proposedAction": "modify"
    }
  ],
  "proposedSolution": "Add schema checks for prompt and repositoryId",
  "implementationSteps": [
    "Check body.prompt and body.repositoryId",
    "Return HTTP 400 if invalid"
  ],
  "potentialRisks": ["None"],
  "estimatedComplexity": "simple"
}
\`\`\`

Let me know if you need code changes!
`;

    const result = ResponseValidator.validateAndParse(fencedJson);
    assert.strictEqual(result.problemUnderstanding, 'API route lacks payload validation');
    assert.strictEqual(result.implementationSteps.length, 2);
  });

  test('throws LLMResponseError on missing problemUnderstanding', () => {
    const invalidJson = JSON.stringify({
      rootCauseHypothesis: 'Some cause',
      relevantFilesAnalysis: [],
      proposedSolution: 'Fix it',
      implementationSteps: ['Step 1'],
    });

    assert.throws(
      () => ResponseValidator.validateAndParse(invalidJson),
      (err: unknown) => {
        return err instanceof LLMResponseError && err.message.includes('problemUnderstanding');
      }
    );
  });

  test('throws LLMResponseError on empty implementationSteps', () => {
    const invalidJson = JSON.stringify({
      problemUnderstanding: 'Something is broken',
      rootCauseHypothesis: 'Bug in code',
      relevantFilesAnalysis: [],
      proposedSolution: 'Fix it',
      implementationSteps: [],
    });

    assert.throws(
      () => ResponseValidator.validateAndParse(invalidJson),
      (err: unknown) => {
        return err instanceof LLMResponseError && err.message.includes('implementationSteps');
      }
    );
  });

  test('throws LLMResponseError on malformed non-JSON text', () => {
    const rawGarbage = 'I am an AI and I cannot output JSON right now.';

    assert.throws(
      () => ResponseValidator.validateAndParse(rawGarbage),
      (err: unknown) => {
        return err instanceof LLMResponseError && err.message.includes('Failed to parse');
      }
    );
  });
});
