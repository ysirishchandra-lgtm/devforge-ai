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
        name: 'Structure Analysis',
        description: 'Scan repository tree, package dependencies, and architecture',
        status: 'pending',
      },
      {
        id: 'file_identification',
        name: 'Target File Search',
        description: 'Locate source files, schemas, and modules matching the request',
        status: 'pending',
      },
      {
        id: 'solution_plan',
        name: 'Solution Planning',
        description: 'Formulate root-cause analysis and step-by-step resolution plan',
        status: 'pending',
      },
      {
        id: 'code_modification',
        name: 'Code Patching',
        description: 'Generate targeted code modifications and diff hunks',
        status: 'pending',
      },
      {
        id: 'verification',
        name: 'Verification Suite',
        description: 'Execute build tests and runtime assertions',
        status: 'pending',
      },
      {
        id: 'summary',
        name: 'Summary & Review',
        description: 'Compile change report and execution audit trail',
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
      changes: [],
      logs: [
        {
          id: `log-init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          stage: 'system',
          level: 'info',
          message: 'Task created. Ready for agent execution.',
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
