import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';
import { ProjectAnalyzer } from '@/lib/analyzer/project-analyzer';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repo = await AppStore.getRepositoryById(id);
    if (!repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const structure = await ProjectAnalyzer.analyze(repo.localPath);
    repo.totalFiles = structure.totalFiles;
    repo.detectedStack = structure.detectedLanguages;
    repo.lastScannedAt = new Date().toISOString();

    await AppStore.saveRepository(repo);

    return NextResponse.json({
      repository: repo,
      structure,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to scan repository';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
