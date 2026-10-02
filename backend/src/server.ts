import express from 'express';
import type { AgentRequest } from '../../shared/contracts.js';
import { handleAgentRequest } from './agent.js';
import { createProject, getProject, listProjects } from './project-store.js';
import { recall } from './memory-store.js';
import { listExecutionLogs } from './execution-store.js';
import { importGitHubRepository } from './github-import.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const requestCounts = new Map<string, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

app.use((req, res, next) => {
  const configuredKey = process.env.BMZ_API_KEY?.trim();
  if (configuredKey && req.header('x-bmz-key') !== configuredKey) {
    res.status(401).json({ success: false, error: 'مفتاح BMZ AI غير صالح أو مفقود.' });
    return;
  }

  const now = Date.now();
  const key = req.ip || 'unknown';
  const current = requestCounts.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestCounts.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  if (current.count >= RATE_LIMIT) {
    res.status(429).json({ success: false, error: 'تم تجاوز حد الطلبات المؤقت.' });
    return;
  }
  current.count += 1;
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'BMZ AI Backend', status: 'ready', port: PORT });
});

app.get('/api/projects', async (_req, res) => {
  res.json({ success: true, projects: await listProjects() });
});

app.post('/api/projects', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  const repositoryUrl = typeof req.body?.repositoryUrl === 'string' ? req.body.repositoryUrl.trim() : undefined;
  res.status(201).json({ success: true, project: await createProject(name, repositoryUrl) });
});

app.post('/api/projects/import-github', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const repositoryUrl = typeof req.body?.repositoryUrl === 'string'
    ? req.body.repositoryUrl.trim()
    : '';

  if (!name || !repositoryUrl) {
    res.status(400).json({
      success: false,
      error: 'name و repositoryUrl مطلوبان.',
    });
    return;
  }

  try {
    const project = await createProject(name, repositoryUrl);
    const imported = await importGitHubRepository(project.id, repositoryUrl);
    res.status(201).json({ success: true, project, imported });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'تعذر استيراد مستودع GitHub.',
    });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, project });
});

app.get('/api/projects/:id/executions', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, executions: await listExecutionLogs(project.id) });
});

app.get('/api/projects/:id/memory', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, entries: await recall(project.id) });
});

app.post('/api/agent', async (req, res) => {
  const body = req.body as Partial<AgentRequest>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    res.status(400).json({ success: false, error: 'message is required' });
    return;
  }
  try {
    const result = await handleAgentRequest({
      message,
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BMZ AI Backend running on http://0.0.0.0:${PORT}`);
});
