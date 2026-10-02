import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  repositoryUrl?: string;
  userId: string;
};

const dataDir = path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(), 'backend', 'data'));
const dataFile = path.join(dataDir, 'projects.json');

async function load(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as Project[] : [];
  } catch {
    return [];
  }
}

async function save(projects: Project[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${dataFile}.tmp-${randomUUID()}`;
  await fs.writeFile(temp, JSON.stringify(projects, null, 2), 'utf8');
  await fs.rename(temp, dataFile);
}

export async function createProject(name: string, repositoryUrl: string | undefined, userId: string): Promise<Project> {
  if (!userId) throw new Error('userId is required');
  const projects = await load();
  const project: Project = {
    id: randomUUID(),
    name: name.trim().slice(0, 120) || 'مشروع جديد',
    createdAt: new Date().toISOString(),
    userId,
    ...(repositoryUrl ? { repositoryUrl } : {}),
  };
  projects.push(project);
  await save(projects);
  return project;
}

export async function listProjects(userId: string): Promise<Project[]> {
  if (!userId) return [];
  return (await load()).filter(project => project.userId === userId);
}

export async function getProject(id: string, userId: string): Promise<Project | null> {
  if (!userId) return null;
  return (await load()).find(project => project.id === id && project.userId === userId) ?? null;
}