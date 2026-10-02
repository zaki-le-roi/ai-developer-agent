import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSandboxWorkspace } from './sandbox-core.js';

type GitHubTreeItem = {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
};

type GitHubTreeResponse = {
  tree?: GitHubTreeItem[];
  truncated?: boolean;
};

type GitHubRepoResponse = {
  default_branch?: string;
};

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_FILE_BYTES = 300_000;

function parseRepositoryUrl(repositoryUrl: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error('رابط GitHub غير صالح.');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error('يسمح فقط بروابط github.com عبر HTTPS.');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('رابط GitHub يجب أن يكون بصيغة owner/repository.');
  const owner = parts[0].replace(/[^a-zA-Z0-9_.-]/g, '');
  const repo = parts[1].replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.git$/i, '');
  if (!owner || !repo) throw new Error('اسم مستودع GitHub غير صالح.');
  return { owner, repo };
}

function isTextPath(filePath: string): boolean {
  const binary = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|7z|rar|exe|dll|so|dylib|mp3|mp4|mov|avi|woff2?|ttf|otf)$/i;
  return !binary.test(filePath);
}

function safeRelativePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error('مسار ملف GitHub غير آمن.');
  }
  return normalized;
}

async function githubJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'BMZ-AI',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API فشل: HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function importGitHubRepository(projectId: string, repositoryUrl: string) {
  const { owner, repo } = parseRepositoryUrl(repositoryUrl);
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const repository = await githubJson<GitHubRepoResponse>(apiBase);
  const branch = repository.default_branch?.trim();
  if (!branch) throw new Error('تعذر تحديد الفرع الافتراضي للمستودع.');

  const tree = await githubJson<GitHubTreeResponse>(
    `${apiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!Array.isArray(tree.tree)) throw new Error('تعذر قراءة شجرة ملفات المستودع.');
  if (tree.truncated) throw new Error('مستودع GitHub كبير جدًا للاستيراد الآمن في عملية واحدة.');

  const files = tree.tree
    .filter((item) => item.type === 'blob' && isTextPath(item.path))
    .slice(0, MAX_FILES);

  if (!files.length) throw new Error('لم أجد ملفات نصية قابلة للاستيراد.');

  const workspace = await createSandboxWorkspace(projectId);
  let totalBytes = 0;
  let imported = 0;
  const importedPaths: string[] = [];

  for (const file of files) {
    if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) continue;

    const blob = await githubJson<{ content?: string; encoding?: string }>(
      `${apiBase}/git/blobs/${file.sha}`,
    );
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') continue;

    const raw = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
    if (raw.length > MAX_FILE_BYTES || totalBytes + raw.length > MAX_TOTAL_BYTES) continue;

    const relative = safeRelativePath(file.path);
    const target = path.join(workspace.directory, relative);
    const resolved = path.resolve(target);
    const root = path.resolve(workspace.directory);
    const relativeCheck = path.relative(root, resolved);
    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
      throw new Error('تم رفض مسار مستورد خارج مساحة المشروع.');
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, raw);
    totalBytes += raw.length;
    imported += 1;
    importedPaths.push(relative);
  }

  const manifestPath = path.join(workspace.directory, '.bmz', 'import-manifest.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify({ repository: `${owner}/${repo}`, branch, paths: importedPaths }, null, 2), 'utf8');

  return {
    projectId,
    repository: `${owner}/${repo}`,
    branch,
    importedFiles: imported,
    totalBytes,
    truncated: files.length >= MAX_FILES,
  };
}
