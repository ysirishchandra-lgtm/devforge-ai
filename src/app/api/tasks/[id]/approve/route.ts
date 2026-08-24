import { NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await AgentOrchestrator.approveAndApply(id);

    return NextResponse.json({
      success: task.status === 'completed' || task.status === 'applied',
      task,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve and apply patch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
