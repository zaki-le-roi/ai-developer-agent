import express from 'express';
import type { AgentRequest } from '../../shared/contracts.js';
import { handleAgentRequest } from './agent.js';
import { createProject, getProject, listProjects } from './project-store.js';
import { recall } from './memory-store.js';
import { listExecutionLogs } from './execution-store.js';
import { importGitHubRepository } from './github-import.js';
import { createSession, getSession, touchSession } from './session-store.js';
import { approveRequest, consumeApproval, requestApproval } from './approval-store.js';
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile, deleteWorkspaceFile } from './workspace-service.js';
import { commitWorkspaceToGitHub } from './github-write.js';
import { latestAndroidBuild, downloadLatestAndroidArtifact, downloadLatestArtifactNamed, downloadLatestMobileArtifact } from './github-actions.js';

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

app.get('/api/projects/:id/files', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) { res.status(404).json({ success:false, error:'project not found' }); return; }
  try { res.json({ success:true, ...(await listWorkspaceFiles(project.id)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة الملفات.'}); }
});

app.get('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id);
  const file = typeof req.query.path === 'string' ? req.query.path : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await readWorkspaceFile(project.id,file)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة الملف.'}); }
});

app.put('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id);
  const file = typeof req.body?.path === 'string' ? req.body.path : '';
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await writeWorkspaceFile(project.id,file,content)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر حفظ الملف.'}); }
});

app.delete('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id);
  const file = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await deleteWorkspaceFile(project.id,file)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر حذف الملف.'}); }
});

app.get('/api/projects/:id/preview', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) { res.status(404).type('text/plain').send('project not found'); return; }
  try {
    const result = await readWorkspaceFile(project.id,'index.html');
    res.type('html').send(result.content);
  } catch(error) {
    res.status(404).type('text/plain').send(error instanceof Error ? error.message : 'لا توجد معاينة.');
  }
});

app.get('/api/projects/:id/github/build', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({success:true, ...(await latestAndroidBuild(project.id))}); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة حالة بناء Android.'}); }
});

app.get('/api/mobile/apk', async (_req, res) => {
  try {
    const projects = await listProjects();
    const project = projects.find((item) => item.repositoryUrl);
    if (!project) { res.status(404).json({success:false,error:'لا يوجد مشروع مرتبط بمستودع GitHub.'}); return; }
    const apk = await downloadLatestArtifactNamed(project.id, 'bmz-ai-mobile-debug-apk');
    res.status(200).type('application/vnd.android.package-archive').set('Content-Disposition','attachment; filename="bmz-ai.apk"').send(apk);
  } catch(error) {
    res.status(404).json({success:false,error:error instanceof Error?error.message:'لا يوجد APK لتطبيق BMZ AI بعد.'});
  }
});

app.get('/api/projects/:id/github/build/apk', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try {
    const artifact = await downloadLatestMobileArtifact(project.id);
    res.status(200).type('application/vnd.android.package-archive').set('Content-Disposition','attachment; filename="bmz-ai.apk"').send(artifact);
  } catch(error) {
    res.status(404).json({success:false,error:error instanceof Error?error.message:'لا يوجد APK جاهز للتنزيل.'});
  }
});

app.post('/api/projects/:id/github/commit', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : 'BMZ AI update';
  const token = typeof req.body?.approvalToken === 'string' ? req.body.approvalToken : '';
  if (!token || !(await consumeApproval(token))) {
    const approval = await requestApproval(project.id,'approval_required','إرسال تغييرات مساحة العمل إلى GitHub سيُنشئ Commit فعليًا في المستودع.');
    res.status(202).json({success:false,approval});
    return;
  }
  try { res.json({success:true,commit:await commitWorkspaceToGitHub(project.id,message)}); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر إنشاء Commit على GitHub.'}); }
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

app.post('/api/sessions', async (req, res) => {
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : null;
  const session = await createSession(projectId);
  res.status(201).json({ success: true, session });
});

app.get('/api/sessions/:id', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) {
    res.status(404).json({ success: false, error: 'session not found' });
    return;
  }
  res.json({ success: true, session });
});

app.post('/api/approvals/:id/approve', async (req, res) => {
  const approval = await approveRequest(req.params.id);
  if (!approval) {
    res.status(404).json({ success: false, error: 'approval not found or expired' });
    return;
  }
  res.json({ success: true, approval });
});

app.post('/api/agent', async (req, res) => {
  const body = req.body as Partial<AgentRequest>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    res.status(400).json({ success: false, error: 'message is required' });
    return;
  }
  try {
    const request: AgentRequest = { ...body, message };
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    if (sessionId) {
      const session = await getSession(sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: 'session not found' });
        return;
      }
      await touchSession(sessionId);
    }
    const result = await handleAgentRequest(request);
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
