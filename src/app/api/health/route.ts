import { NextResponse } from 'next/server';
import os from 'os';
import { GitService } from '@/lib/git/git-service';
import { getSafeConfigSummary } from '@/lib/config';

export async function GET() {
  try {
    let gitVersion = 'Unknown';
    try {
      gitVersion = await GitService.getGitVersion();
    } catch {
      gitVersion = 'Not installed or not in PATH';
    }

    const config = getSafeConfigSummary();

    return NextResponse.json({
      status: 'healthy',
      version: '0.1.0',
      gitVersion,
      nodeVersion: process.version,
      osPlatform: `${os.platform()} (${os.arch()})`,
      storageDir: config.storageDir,
      aiProvider: config.aiProvider,
      hasGeminiKey: config.hasGeminiKey,
      hasOpenAIKey: config.hasOpenAIKey,
      hasAnthropicKey: config.hasAnthropicKey,
      hasGithubToken: config.hasGithubToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
