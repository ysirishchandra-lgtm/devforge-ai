import fs from 'fs/promises';
import path from 'path';
import { FileNode, ProjectStructure, RelevantFile } from '@/types';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.vscode',
  '.idea',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  '.gemini',
]);

const IGNORED_FILES = new Set([
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
]);

export class ProjectAnalyzer {
  /**
   * Traverse workspace filesystem to build file tree and detect tech stack
   */
  static async analyze(rootPath: string): Promise<ProjectStructure> {
    let totalFiles = 0;
    let totalDirectories = 0;
    const detectedLanguages = new Set<string>();
    const detectedFrameworks = new Set<string>();
    const entrypoints: string[] = [];
    const configFiles: string[] = [];

    async function walkDir(currentPath: string, relativePath = ''): Promise<FileNode[]> {
      const nodes: FileNode[] = [];
      let entries: string[] = [];

      try {
        entries = await fs.readdir(currentPath);
      } catch {
        return [];
      }

      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry) || IGNORED_FILES.has(entry)) {
          continue;
        }

        const fullPath = path.join(currentPath, entry);
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;

        try {
          const stat = await fs.stat(fullPath);

          if (stat.isDirectory()) {
            totalDirectories++;
            const children = await walkDir(fullPath, relPath);
            nodes.push({
              name: entry,
              path: relPath,
              type: 'directory',
              children,
            });
          } else if (stat.isFile()) {
            totalFiles++;
            const ext = path.extname(entry).toLowerCase();

            // Detect language
            if (ext === '.ts' || ext === '.tsx') detectedLanguages.add('TypeScript');
            else if (ext === '.js' || ext === '.jsx' || ext === '.mjs') detectedLanguages.add('JavaScript');
            else if (ext === '.py') detectedLanguages.add('Python');
            else if (ext === '.go') detectedLanguages.add('Go');
            else if (ext === '.rs') detectedLanguages.add('Rust');
            else if (ext === '.java') detectedLanguages.add('Java');
            else if (ext === '.css' || ext === '.scss') detectedLanguages.add('CSS');
            else if (ext === '.html') detectedLanguages.add('HTML');
            else if (ext === '.json') detectedLanguages.add('JSON');
            else if (ext === '.md') detectedLanguages.add('Markdown');

            // Detect configs & entrypoints
            if (entry === 'package.json') {
              configFiles.push(relPath);
              detectedLanguages.add('JavaScript/TypeScript');
            } else if (entry === 'tsconfig.json') {
              configFiles.push(relPath);
            } else if (entry.startsWith('next.config.')) {
              configFiles.push(relPath);
              detectedFrameworks.add('Next.js');
            } else if (entry.startsWith('vite.config.')) {
              configFiles.push(relPath);
              detectedFrameworks.add('Vite');
            } else if (entry === 'requirements.txt' || entry === 'pyproject.toml') {
              configFiles.push(relPath);
              detectedLanguages.add('Python');
            } else if (entry === 'Cargo.toml') {
              configFiles.push(relPath);
              detectedLanguages.add('Rust');
            } else if (entry === 'go.mod') {
              configFiles.push(relPath);
              detectedLanguages.add('Go');
            }

            if (
              entry === 'index.ts' ||
              entry === 'index.js' ||
              entry === 'main.ts' ||
              entry === 'main.py' ||
              entry === 'page.tsx' ||
              entry === 'App.tsx'
            ) {
              entrypoints.push(relPath);
            }

            nodes.push({
              name: entry,
              path: relPath,
              type: 'file',
              sizeBytes: stat.size,
              extension: ext,
            });
          }
        } catch {
          // Skip inaccessible entries
        }
      }

      return nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    const fileTree = await walkDir(rootPath);

    // Inspect package.json if present
    let testCommand: string | undefined;
    let buildCommand: string | undefined;
    const verificationCommands: string[] = [];

    try {
      const pkgPath = path.join(rootPath, 'package.json');
      const pkgData = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

      if (pkgData.dependencies?.next || pkgData.devDependencies?.next) {
        detectedFrameworks.add('Next.js');
      }
      if (pkgData.dependencies?.react || pkgData.devDependencies?.react) {
        detectedFrameworks.add('React');
      }
      if (pkgData.dependencies?.vue || pkgData.devDependencies?.vue) {
        detectedFrameworks.add('Vue');
      }
      if (pkgData.dependencies?.express || pkgData.devDependencies?.express) {
        detectedFrameworks.add('Express');
      }
      if (pkgData.dependencies?.tailwindcss || pkgData.devDependencies?.tailwindcss) {
        detectedFrameworks.add('TailwindCSS');
      }

      if (pkgData.scripts?.test && pkgData.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        testCommand = 'npm test';
        verificationCommands.push('npm test');
      }
      if (pkgData.scripts?.lint) {
        verificationCommands.push('npm run lint');
      }
      if (pkgData.scripts?.build) {
        buildCommand = 'npm run build';
        verificationCommands.push('npm run build');
      }
    } catch {
      // package.json doesn't exist or is invalid
    }

    // Default fallback commands based on detected languages
    if (verificationCommands.length === 0) {
      if (detectedLanguages.has('Python')) {
        testCommand = 'pytest';
        verificationCommands.push('pytest');
      } else if (detectedLanguages.has('Rust')) {
        testCommand = 'cargo test';
        verificationCommands.push('cargo test');
      } else if (detectedLanguages.has('Go')) {
        testCommand = 'go test ./...';
        verificationCommands.push('go test ./...');
      }
    }

    return {
      rootPath,
      totalFiles,
      totalDirectories,
      detectedLanguages: Array.from(detectedLanguages),
      detectedFrameworks: Array.from(detectedFrameworks),
      verificationCommands,
      testCommand,
      buildCommand,
      entrypoints,
      configFiles,
      fileTree,
    };
  }

  /**
   * Search for relevant files based on user prompt / bug description
   */
  static async findRelevantFiles(
    rootPath: string,
    prompt: string,
    fileTree: FileNode[]
  ): Promise<RelevantFile[]> {
    const keywords = prompt
      .toLowerCase()
      .replace(/[^a-z0-9_\-\.\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const relevantFiles: RelevantFile[] = [];

    async function evaluateNodes(nodes: FileNode[]) {
      for (const node of nodes) {
        if (node.type === 'directory' && node.children) {
          await evaluateNodes(node.children);
        } else if (node.type === 'file') {
          let score = 0;
          const reasons: string[] = [];
          const lowerPath = node.path.toLowerCase();
          const fileName = node.name.toLowerCase();

          // 1. Path/Filename exact keyword matching
          for (const kw of keywords) {
            if (fileName.includes(kw)) {
              score += 35;
              reasons.push(`Filename matches keyword "${kw}"`);
            } else if (lowerPath.includes(kw)) {
              score += 20;
              reasons.push(`Path matches keyword "${kw}"`);
            }
          }

          // 2. Read file content for token matches if size is reasonable (< 500KB)
          if ((node.sizeBytes || 0) < 500 * 1024) {
            try {
              const fullPath = path.join(rootPath, node.path);
              const content = await fs.readFile(fullPath, 'utf8');
              const lowerContent = content.toLowerCase();

              let matchCount = 0;
              for (const kw of keywords) {
                if (lowerContent.includes(kw)) {
                  matchCount++;
                  score += 10;
                }
              }

              if (matchCount > 0) {
                reasons.push(`Found ${matchCount} keyword references in file content`);
              }

              // Give priority to error handlers, test files, or core business logic if relevant to prompt
              if (prompt.toLowerCase().includes('test') && (lowerPath.includes('test') || lowerPath.includes('spec'))) {
                score += 25;
                reasons.push('Relevant test suite file');
              }
            } catch {
              // Skip binary or unreadable file
            }
          }

          if (score > 0) {
            relevantFiles.push({
              path: node.path,
              relevanceScore: Math.min(100, score),
              reason: reasons.slice(0, 3).join('; ') || 'Matched context query',
              language: node.extension?.replace('.', '').toUpperCase(),
              sizeBytes: node.sizeBytes,
            });
          }
        }
      }
    }

    await evaluateNodes(fileTree);

    // Return top 10 most relevant files sorted by relevance score
    return relevantFiles.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);
  }
}
