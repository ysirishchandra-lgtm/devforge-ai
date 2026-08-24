import { NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Execute orchestrator
    const completedTask = await AgentOrchestrator.runTask(id);

    return NextResponse.json({
      success: completedTask.status === 'completed',
      task: completedTask,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Task execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
