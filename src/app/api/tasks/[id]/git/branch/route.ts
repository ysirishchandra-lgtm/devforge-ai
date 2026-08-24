import { NextResponse } from 'next/server';
import { AppStore } from '@/lib/storage/store';
import { GitService } from '@/lib/git/git-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await AppStore.getTaskById(id);

    if (!task) {
      return NextResponse.json({ error: `Task "${id}" not found` }, { status: 404 });
    }

    const repo = await AppStore.getRepositoryById(task.repositoryId);
    if (!repo) {
      return NextResponse.json(
        { error: `Repository "${task.repositoryId}" not found` },
        { status: 404 }
      );
    }

    // 1. Safety Check: Verify task state is approved & applied
    if (task.status !== 'completed' && task.status !== 'applied') {
      return NextResponse.json(
        {
          error: `Cannot create repair branch: Task status is "${task.status}". Patch must be explicitly approved and applied first.`,
        },
        { status: 400 }
      );
    }

    // 2. Safety Check: Verify verification passed on the server
    const verification = task.verification;
    if (!verification) {
      return NextResponse.json(
        {
          error: 'Cannot create repair branch: Task verification results are missing.',
        },
        { status: 400 }
      );
    }

    const passed =
      verification.overallStatus === 'PASS' ||
      (verification.results &&
        verification.results.length > 0 &&
        verification.results.every((r) => r.status === 'PASS'));

    if (!passed) {
      return NextResponse.json(
        {
          error: `Cannot create repair branch: Verification checks failed (Status: ${verification.overallStatus}). Only verified repairs may be staged to Git.`,
        },
        { status: 400 }
      );
    }

    // 3. Create repair branch safely
    const topic = task.plan?.problemUnderstanding || task.title || task.prompt;
    const patchFiles = task.patchProposal?.modifiedFiles || [];

    const branchInfo = await GitService.createRepairBranch(repo.localPath, {
      topic,
      taskId: task.id,
      patchFiles,
    });

    task.gitBranchInfo = branchInfo;
    task.logs.push({
      id: `log-git-${Date.now()}`,
      timestamp: new Date().toISOString(),
      stage: 'summary',
      level: 'success',
      message: `🌿 Git repair branch created safely: "${branchInfo.branchName}" (Base: ${branchInfo.baseBranch}). Status: READY FOR COMMIT.`,
      details: {
        branch: branchInfo.branchName,
        changedFiles: branchInfo.changedFiles,
        diffSummary: branchInfo.diffSummary,
      },
    });

    await AppStore.saveTask(task);

    return NextResponse.json({
      success: true,
      branchInfo,
      task,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create repair branch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
