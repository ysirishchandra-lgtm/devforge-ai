import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';
import { ProjectAnalyzer } from '@/lib/analyzer/project-analyzer';
import { GitService } from '@/lib/git/git-service';

export async function GET(
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
    let gitInfo = null;
    try {
      gitInfo = await GitService.getRepoInfo(repo.localPath);
    } catch {
      // Non-git repo or empty
    }

    return NextResponse.json({
      repository: repo,
      structure,
      gitInfo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load repository details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
