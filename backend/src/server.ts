import express from 'express';
import type { AgentRequest } from '../../shared/contracts.js';
import { handleAgentRequest } from './agent.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'BMZ AI Backend',
    status: 'ready',
    port: PORT,
  });
});

app.post('/api/agent', (req, res) => {
  const body = req.body as Partial<AgentRequest>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    res.status(400).json({
      success: false,
      error: 'message is required',
    });
    return;
  }

  const result = handleAgentRequest({
    message,
    projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
  });

  res.json(result);
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BMZ AI Backend running on http://0.0.0.0:${PORT}`);
});
