import { randomUUID } from 'node:crypto';

export type Project = { id: string; name: string; createdAt: string };

const projects = new Map<string, Project>();

export function createProject(name: string): Project {
  const project = { id: randomUUID(), name: name.trim().slice(0, 120) || 'مشروع جديد', createdAt: new Date().toISOString() };
  projects.set(project.id, project);
  return project;
}

export function listProjects(): Project[] {
  return [...projects.values()];
}

export function getProject(id: string): Project | null {
  return projects.get(id) ?? null;
}
