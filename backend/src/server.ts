import express from 'express';
import type { AgentRequest } from '../../shared/contracts.js';
import { handleAgentRequest } from './agent.js';
import { createProject, getProject, listProjects } from './project-store.js';
import { recall } from './memory-store.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

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
  res.status(201).json({ success: true, project: await createProject(name) });
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, project });
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
