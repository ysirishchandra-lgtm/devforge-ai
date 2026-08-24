import fs from 'fs/promises';
import path from 'path';
import { ExtractedFileContext, RelevantFile } from '@/types';

// Sensitive patterns that must NEVER be read or sent to an LLM
const EXCLUDED_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.cer$/i,
  /^id_rsa/i,
  /^id_dsa/i,
  /^id_ecdsa/i,
  /^id_ed25519/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /\.token$/i,
  /\.npmrc$/i,
  /\.yarnrc$/i,
  /id_rsa/i,
];

const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.devforge_data',
  'temp_repos',
  '.vscode',
  '.idea',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  '.gemini',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.bmp',
  '.tiff',
  '.mp3',
  '.mp4',
  '.wav',
  '.mov',
  '.webm',
  '.avi',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.pyc',
  '.wasm',
  '.pdf',
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.bin',
  '.iso',
  '.dmg',
  '.lock',
  '.package-lock.json',
]);

export interface ContextExtractionOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

export class ContextExtractor {
  /**
   * Validate that a target path is strictly inside the repository root (prevents path traversal)
   */
  static isSafePath(repoRoot: string, targetPath: string): boolean {
    if (!repoRoot || !targetPath) return false;
    
    // Disallow null bytes or suspicious characters
    if (targetPath.includes('\0')) return false;

    const resolvedRoot = path.resolve(repoRoot);
    const resolvedTarget = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(resolvedRoot, targetPath);

    // Normalize casing for Windows
    const lowerRoot = resolvedRoot.toLowerCase();
    const lowerTarget = resolvedTarget.toLowerCase();

    return lowerTarget === lowerRoot || lowerTarget.startsWith(lowerRoot + path.sep);
  }

  /**
   * Check if a file should be excluded due to secrets, environment variables, or ignored directories
   */
  static isExcludedFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const fileName = segments[segments.length - 1] || '';

    // Check directory names in path
    for (const segment of segments.slice(0, -1)) {
      if (EXCLUDED_DIR_NAMES.has(segment.toLowerCase())) {
        return true;
      }
    }

    // Check sensitive file patterns
    for (const pattern of EXCLUDED_PATTERNS) {
      if (pattern.test(fileName)) {
        return true;
      }
    }

    // Explicit check for .env variants
    if (fileName.startsWith('.env')) {
      return true;
    }

    return false;
  }

  /**
   * Check if a file has a binary extension
   */
  static isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  }

  /**
   * Safely extract content for relevant files up to budget limits
   */
  static async extractSafeContext(
    repoRoot: string,
    relevantFiles: RelevantFile[],
    options?: ContextExtractionOptions
  ): Promise<ExtractedFileContext[]> {
    const maxFiles = options?.maxFiles ?? 6;
    const maxFileBytes = options?.maxFileBytes ?? 25 * 1024; // 25KB per file
    const maxTotalBytes = options?.maxTotalBytes ?? 80 * 1024; // 80KB total context

    const extracted: ExtractedFileContext[] = [];
    let currentTotalBytes = 0;

    for (const file of relevantFiles) {
      if (extracted.length >= maxFiles) break;
      if (currentTotalBytes >= maxTotalBytes) break;

      const relPath = file.path;

      // Security check 1: Path traversal
      if (!this.isSafePath(repoRoot, relPath)) {
        continue;
      }

      // Security check 2: Secrets & environment variables
      if (this.isExcludedFile(relPath)) {
        continue;
      }

      // Security check 3: Binary files
      if (this.isBinaryFile(relPath)) {
        continue;
      }

      try {
        const fullPath = path.resolve(repoRoot, relPath);
        const stat = await fs.stat(fullPath);

        if (!stat.isFile()) continue;

        let content = await fs.readFile(fullPath, 'utf8');
        let isTruncated = false;

        // Truncate individual file if oversized
        if (content.length > maxFileBytes) {
          content = content.slice(0, maxFileBytes) + '\n\n/* ... [DevForge: Content truncated for context limit] ... */';
          isTruncated = true;
        }

        // Budget check
        const contentBytes = Buffer.byteLength(content, 'utf8');
        if (currentTotalBytes + contentBytes > maxTotalBytes) {
          const remainingBudget = Math.max(0, maxTotalBytes - currentTotalBytes);
          if (remainingBudget > 500) {
            content = content.slice(0, remainingBudget) + '\n\n/* ... [DevForge: Content truncated for total budget] ... */';
            isTruncated = true;
          } else {
            break;
          }
        }

        currentTotalBytes += Buffer.byteLength(content, 'utf8');

        extracted.push({
          path: relPath,
          language: path.extname(relPath).replace('.', '').toUpperCase() || 'TEXT',
          sizeBytes: stat.size,
          content,
          isTruncated,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return extracted;
  }
}
