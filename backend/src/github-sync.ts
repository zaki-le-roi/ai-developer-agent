import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getProject } from './project-store.js';

type Repo = { owner: string; repo: string };

function parseRepositoryUrl(repositoryUrl: string): Repo {
  const url = new URL(repositoryUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('يسمح فقط بروابط GitHub HTTPS.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('رابط GitHub غير صالح.');
  const owner = parts[0].replace(/[^a-zA-Z0-9_.-]/g, '');
  const repo = parts[1].replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.git$/i, '');
  if (!owner || !repo) throw new Error('مستودع GitHub غير صالح.');
  return { owner, repo };
}

function headers(): Record<string,string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('GITHUB_TOKEN غير مُعد، ولا يمكن تنفيذ عمليات GitHub الكتابية.');
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BMZ-AI' };
}

async function githubJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`GitHub API فشل: HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function githubRepoInfo(projectId: string) {
  const project = await getProject(projectId);
  if (!project?.repositoryUrl) throw new Error('المشروع غير مرتبط بمستودع GitHub.');
  const { owner, repo } = parseRepositoryUrl(project.repositoryUrl);
  const data = await githubJson<{ full_name: string; default_branch: string; private: boolean }>(`https://api.github.com/repos/${owner}/${repo}`);
  return { repository: data.full_name, defaultBranch: data.default_branch, private: data.private };
}

export async function githubCommitFile(projectId: string, filePath: string, content: string, message: string, branch?: string) {
  const project = await getProject(projectId);
  if (!project?.repositoryUrl) throw new Error('المشروع غير مرتبط بمستودع GitHub.');
  const { owner, repo } = parseRepositoryUrl(project.repositoryUrl);
  const cleanPath = path.posix.normalize(filePath);
  if (!cleanPath || cleanPath === '.' || cleanPath.startsWith('../') || cleanPath.startsWith('/')) throw new Error('مسار GitHub غير آمن.');
  if (content.length > 300_000) throw new Error('ملف GitHub أكبر من الحد المسموح.');
  const base = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}`;
  const repoInfo = await githubJson<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repo}`);
  const targetBranch = branch?.trim() || repoInfo.default_branch;
  let sha: string | undefined;
  try {
    const current = await githubJson<{ sha?: string }>(`${base}?ref=${encodeURIComponent(targetBranch)}`);
    sha = current.sha;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('HTTP 404')) throw error;
  }
  const payload = { message: message.trim().slice(0, 200) || 'BMZ AI update', content: Buffer.from(content, 'utf8').toString('base64'), branch: targetBranch, ...(sha ? { sha } : {}) };
  const result = await githubJson<{ commit?: { sha?: string }; content?: { path?: string } }>(base, { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
  return { repository: `${owner}/${repo}`, branch: targetBranch, path: result.content?.path ?? cleanPath, commitSha: result.commit?.sha ?? null };
}

export async function workspaceSourceMetadata(projectId: string) {
  const project = await getProject(projectId);
  if (!project?.repositoryUrl) return null;
  return { repositoryUrl: project.repositoryUrl };
}