import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await AppStore.getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch task';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
