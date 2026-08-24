import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';
import { TaskRun, TaskStage } from '@/types';

export async function GET() {
  try {
    const tasks = await AppStore.getTasks();
    return NextResponse.json(tasks);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch tasks';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, prompt, repositoryId } = body;

    if (!prompt || !repositoryId) {
      return NextResponse.json(
        { error: 'prompt and repositoryId are required' },
        { status: 400 }
      );
    }

    const defaultStages: TaskStage[] = [
      {
        id: 'structure_analysis',
        name: 'Structure Scan',
        description: 'Map workspace filesystem and analyze architecture',
        status: 'pending',
      },
      {
        id: 'file_identification',
        name: 'Target Search',
        description: 'Score and rank files matching the task request',
        status: 'pending',
      },
      {
        id: 'context_collection',
        name: 'Context Extraction',
        description: 'Safely collect code context filtering secrets and binaries',
        status: 'pending',
      },
      {
        id: 'ai_analysis',
        name: 'AI Reasoning',
        description: 'Execute deep codebase analysis with configured LLM provider',
        status: 'pending',
      },
      {
        id: 'patch_generation',
        name: 'Patch Proposal',
        description: 'Generate targeted code patch and calculate unified diffs',
        status: 'pending',
      },
      {
        id: 'approval_and_apply',
        name: 'Human Approval & Apply',
        description: 'Await developer review and apply validated patch atomically',
        status: 'pending',
      },
      {
        id: 'verification',
        name: 'Verification Suite',
        description: 'Execute automated build and regression test checks',
        status: 'pending',
      },
      {
        id: 'summary',
        name: 'Review & Audit',
        description: 'Compile task audit trail and telemetry review',
        status: 'pending',
      },
    ];

    const newTask: TaskRun = {
      id: `task-${Date.now()}`,
      title: title || (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt),
      prompt,
      repositoryId,
      status: 'idle',
      currentStageIndex: 0,
      stages: defaultStages,
      relevantFiles: [],
      logs: [
        {
          id: `log-init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          stage: 'system',
          level: 'info',
          message: 'Task created. Ready for repository analysis and targeted code repair.',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await AppStore.saveTask(newTask);
    return NextResponse.json(newTask, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create task';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
