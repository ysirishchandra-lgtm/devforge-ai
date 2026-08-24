import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';
import { GitService } from '@/lib/git/git-service';
import { ProjectAnalyzer } from '@/lib/analyzer/project-analyzer';
import { Repository } from '@/types';

export async function GET() {
  try {
    const repos = await AppStore.getRepositories();
    return NextResponse.json(repos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch repositories';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { remoteUrl, localPath, customName } = body;

    let targetPath = localPath;
    let branch = 'main';
    let repoName = customName || 'workspace';

    // If cloning from a remote GitHub repo
    if (remoteUrl) {
      const cloneResult = await GitService.cloneRepository(remoteUrl, customName);
      targetPath = cloneResult.localPath;
      branch = cloneResult.branch;
      repoName = cloneResult.repoName;
    } else if (localPath) {
      // Connect existing local folder
      try {
        const repoInfo = await GitService.getRepoInfo(localPath);
        branch = repoInfo.branch;
      } catch {
        // Not a git repo or fresh directory
      }
    } else {
      return NextResponse.json(
        { error: 'Either remoteUrl or localPath is required' },
        { status: 400 }
      );
    }

    // Analyze initial structure
    const structure = await ProjectAnalyzer.analyze(targetPath);

    const newRepo: Repository = {
      id: `repo-${Date.now()}`,
      name: repoName,
      localPath: targetPath,
      remoteUrl: remoteUrl || undefined,
      branch,
      isClean: true,
      totalFiles: structure.totalFiles,
      detectedStack: structure.detectedLanguages,
      lastScannedAt: new Date().toISOString(),
      isCloned: true,
    };

    await AppStore.saveRepository(newRepo);
    return NextResponse.json(newRepo, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add repository';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
