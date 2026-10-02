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
import { runCommandInSandbox } from './sandbox-tools.js';
import { listTasks, getTask } from './task-store.js';
import { enqueueAgentTask, cancelTask } from './task-queue.js';
import { eventsSse } from './realtime.js';
import { runWorkflow, type Workflow } from './workflow-engine.js';
import { register, login, logout, authenticate, requireAuth } from './auth.js';
import { grantPermission, revokePermission, listPermissions } from './permission-store.js';
import { githubRepo, branches, issues, pullRequests, actions, createIssue, commentIssue, createPullRequest, createBranch } from './github-api.js';
import { startScheduler, listSchedules, createSchedule, disableSchedule } from './scheduler.js';
import { createWebhook, listWebhooks, resolveWebhook } from './webhook-store.js';
import { listWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow } from './workflow-store.js';
import { startPreview, previewInfo, stopPreview, proxyPreview } from './preview-service.js';
import { createOAuthState, consumeOAuthState, exchangeGitHubCode } from './github-auth.js';

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

app.post('/api/auth/register', (req,res)=>{try{const email=typeof req.body?.email==='string'?req.body.email.trim():'';const password=typeof req.body?.password==='string'?req.body.password:'';if(!/^\S+@\S+\.\S+$/.test(email)){res.status(400).json({success:false,error:'بريد إلكتروني غير صالح.'});return;}res.status(201).json({success:true,user:register(email,password)})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر إنشاء الحساب.'})}});
app.post('/api/auth/login', (req,res)=>{try{const email=typeof req.body?.email==='string'?req.body.email.trim():'';const password=typeof req.body?.password==='string'?req.body.password:'';res.json({success:true,...login(email,password)})}catch(error){res.status(401).json({success:false,error:error instanceof Error?error.message:'تعذر تسجيل الدخول.'})}});
app.post('/api/auth/logout',(req,res)=>{res.json({success:logout(req)})});
app.get('/api/auth/me',(req,res)=>{const user=authenticate(req);if(!user){res.status(401).json({success:false,error:'غير مسجل الدخول.'});return}res.json({success:true,user:{id:user.id,email:user.email}})});

app.get('/api/github/oauth/start', (req,res)=>{const user=authenticate(req);if(!user){res.status(401).json({success:false,error:'المصادقة مطلوبة.'});return;}const clientId=process.env.GITHUB_CLIENT_ID;const redirect=process.env.GITHUB_REDIRECT_URI;if(!clientId||!redirect){res.status(503).json({success:false,error:'GitHub OAuth غير مهيأ على الخادم.'});return;}const state=createOAuthState(user.id);const url=new URL('https://github.com/login/oauth/authorize');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',redirect);url.searchParams.set('scope','repo read:user');url.searchParams.set('state',state);res.json({success:true,url:url.toString()});});
app.get('/api/github/oauth/callback', async (req,res)=>{try{const state=typeof req.query.state==='string'?req.query.state:'';const code=typeof req.query.code==='string'?req.query.code:'';if(!state||!code){res.status(400).send('OAuth callback غير مكتمل.');return;}const userId=consumeOAuthState(state);await exchangeGitHubCode(userId,code);res.type('html').send('<html lang="ar" dir="rtl"><body><h2>تم ربط GitHub بنجاح.</h2><p>يمكنك العودة إلى BMZ AI.</p></body></html>');}catch(e){res.status(400).send(e instanceof Error?e.message:'فشل ربط GitHub.');}});
app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'BMZ AI Backend', status: 'ready', port: PORT });
});

app.use('/api/projects', requireAuth);
app.use('/api/tasks', requireAuth);
app.use('/api/workflows', requireAuth);
app.use('/api/agent', requireAuth);
app.use('/api/events', requireAuth);
app.use('/api/sessions', requireAuth);
app.use('/api/approvals', requireAuth);

app.get('/api/projects', async (req, res) => {
  res.json({ success: true, projects: await listProjects(res.locals.user.id) });
});

app.post('/api/projects', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  const repositoryUrl = typeof req.body?.repositoryUrl === 'string' ? req.body.repositoryUrl.trim() : undefined;
  res.status(201).json({ success: true, project: await createProject(name, repositoryUrl, res.locals.user.id) });
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
    const project = await createProject(name, repositoryUrl, res.locals.user.id);
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
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, project });
});

app.get('/api/projects/:id/files', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) { res.status(404).json({ success:false, error:'project not found' }); return; }
  try { res.json({ success:true, ...(await listWorkspaceFiles(project.id)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة الملفات.'}); }
});

app.get('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  const file = typeof req.query.path === 'string' ? req.query.path : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await readWorkspaceFile(project.id,file)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة الملف.'}); }
});

app.put('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  const file = typeof req.body?.path === 'string' ? req.body.path : '';
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await writeWorkspaceFile(project.id,file,content)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر حفظ الملف.'}); }
});

app.delete('/api/projects/:id/file', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  const file = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({ success:true, ...(await deleteWorkspaceFile(project.id,file)) }); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر حذف الملف.'}); }
});

app.post('/api/projects/:id/preview/start', async (req,res)=>{const project=await getProject(req.params.id,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}try{res.json({success:true,preview:await startPreview(project.id)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر تشغيل Preview.'});}});
app.post('/api/projects/:id/preview/stop', async (req,res)=>{const project=await getProject(req.params.id,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}res.json({success:stopPreview(project.id)});});
app.use('/preview/:id', async (req,res)=>{const token=typeof req.query.token==='string'?req.query.token:'';const item=previewInfo(req.params.id,token);if(!item){res.status(404).send('Preview not found');return;}const prefix='/preview/'+req.params.id;const pathName=req.originalUrl.split('?')[0].slice(prefix.length)||'/';proxyPreview(item,req,res,pathName);});
app.get('/api/projects/:id/preview', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) { res.status(404).type('text/plain').send('project not found'); return; }
  try {
    const result = await readWorkspaceFile(project.id,'index.html');
    res.type('html').send(result.content);
  } catch(error) {
    res.status(404).type('text/plain').send(error instanceof Error ? error.message : 'لا توجد معاينة.');
  }
});

app.get('/api/projects/:id/github/build', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try { res.json({success:true, ...(await latestAndroidBuild(project.id,res.locals.user.id))}); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر قراءة حالة بناء Android.'}); }
});

app.get('/api/mobile/apk', async (_req, res) => {
  try {
    const projects = await listProjects(res.locals.user.id);
    const project = projects.find((item) => item.repositoryUrl);
    if (!project) { res.status(404).json({success:false,error:'لا يوجد مشروع مرتبط بمستودع GitHub.'}); return; }
    const apk = await downloadLatestArtifactNamed(project.id,res.locals.user.id, 'bmz-ai-mobile-debug-apk');
    res.status(200).type('application/vnd.android.package-archive').set('Content-Disposition','attachment; filename="bmz-ai.apk"').send(apk);
  } catch(error) {
    res.status(404).json({success:false,error:error instanceof Error?error.message:'لا يوجد APK لتطبيق BMZ AI بعد.'});
  }
});

app.get('/api/projects/:id/github/build/apk', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  try {
    const artifact = await downloadLatestMobileArtifact(project.id,res.locals.user.id);
    res.status(200).type('application/vnd.android.package-archive').set('Content-Disposition','attachment; filename="bmz-ai.apk"').send(artifact);
  } catch(error) {
    res.status(404).json({success:false,error:error instanceof Error?error.message:'لا يوجد APK جاهز للتنزيل.'});
  }
});

app.post('/api/projects/:id/github/commit', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) { res.status(404).json({success:false,error:'project not found'}); return; }
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : 'BMZ AI update';
  const token = typeof req.body?.approvalToken === 'string' ? req.body.approvalToken : '';
  if (!token || !(await consumeApproval(res.locals.user.id,token))) {
    const approval = await requestApproval(res.locals.user.id,project.id,'approval_required','إرسال تغييرات مساحة العمل إلى GitHub سيُنشئ Commit فعليًا في المستودع.');
    res.status(202).json({success:false,approval});
    return;
  }
  try { res.json({success:true,commit:await commitWorkspaceToGitHub(project.id,res.locals.user.id,message)}); }
  catch(error){ res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر إنشاء Commit على GitHub.'}); }
});

app.post('/api/projects/:id/terminal', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
  const args = Array.isArray(req.body?.args) ? req.body.args.filter((item: unknown): item is string => typeof item === 'string') : [];
  if (!project) { res.status(404).json({ success:false, error:'project not found' }); return; }
  if (!command) { res.status(400).json({ success:false, error:'command is required' }); return; }
  try {
    const result = await runCommandInSandbox(project.id, command, args);
    res.json({ success: result.code === 0, result });
  } catch(error) {
    res.status(400).json({ success:false,error:error instanceof Error?error.message:'تعذر تنفيذ الأمر.' });
  }
});

app.get('/api/github/repo/:id',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,repo:await githubRepo(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/branches',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,branches:await branches(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/issues',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,issues:await issues(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/prs',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,pullRequests:await pullRequests(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/actions',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,runs:await actions(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.post('/api/github/:id/issue',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const title=typeof req.body?.title==='string'?req.body.title.trim():'';const body=typeof req.body?.body==='string'?req.body.body:'';if(!title){res.status(400).json({success:false,error:'title is required'});return;}try{const approval=await requestApproval(res.locals.user.id,p.id,'github_write','إنشاء Issue على GitHub عملية كتابة خارج مساحة العمل.');res.status(202).json({success:false,approval,pending:{operation:'issue',title,body}});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر طلب الموافقة.'});}});
app.post('/api/github/:id/branch',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const name=typeof req.body?.name==='string'?req.body.name.trim():'';const from=typeof req.body?.from==='string'?req.body.from.trim():'main';if(!/^[A-Za-z0-9._\\/-]{1,80}$/.test(name)){res.status(400).json({success:false,error:'اسم الفرع غير صالح.'});return;}const approval=await requestApproval(res.locals.user.id,p.id,'github_write','إنشاء Branch على GitHub يتطلب موافقة صريحة.');res.status(202).json({success:false,approval,pending:{operation:'branch',name,from}});});
app.get('/api/permissions', async (req,res)=>{res.json({success:true,permissions:await listPermissions(res.locals.user.id)});});
app.post('/api/permissions', async (req,res)=>{try{const permission=req.body?.permission as any;const allowed=['READ_PROJECT','WRITE_PROJECT','DELETE_FILE','RUN_COMMAND','NETWORK_ACCESS','GITHUB_READ','GITHUB_WRITE','GITHUB_PUSH','GITHUB_MERGE','SEND_MESSAGE','BROWSER_AUTOMATION','SCHEDULE_WORKFLOW'];if(!allowed.includes(permission)){res.status(400).json({success:false,error:'صلاحية غير معروفة.'});return;}const projectId=typeof req.body?.projectId==='string'?req.body.projectId:null;res.status(201).json({success:true,permission:await grantPermission(res.locals.user.id,projectId,permission,typeof req.body?.scope==='string'?req.body.scope:undefined)});}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر منح الصلاحية.'})}});
app.delete('/api/permissions/:id', async (req,res)=>{res.json({success:await revokePermission(req.params.id,res.locals.user.id)});});
app.post('/api/webhooks',async(req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const workflow=req.body?.workflow as Workflow|undefined;if(!workflow){res.status(400).json({success:false,error:'workflow مطلوب'});return;}res.status(201).json({success:true,webhook:await createWebhook(res.locals.user.id,projectId,workflow)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Webhook.'});}});
app.get('/api/webhooks',async(req,res)=>res.json({success:true,webhooks:await listWebhooks(res.locals.user.id)}));

app.post('/api/webhooks/trigger/:token',async(req,res)=>{const hook=await resolveWebhook(req.params.token);if(!hook){res.status(404).json({success:false,error:'webhook not found'});return;}try{const result=await runWorkflow(hook.workflow,hook.projectId);res.json({success:true,result})}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل تشغيل Workflow.'})}});
app.get('/api/schedules',async(req,res)=>{res.json({success:true,schedules:await listSchedules(res.locals.user.id)})});
app.post('/api/schedules',async(req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const cron=typeof req.body?.cron==='string'?req.body.cron.trim():'';const workflow=req.body?.workflow as Workflow|undefined;if(!cron||!workflow){res.status(400).json({success:false,error:'cron و workflow مطلوبان'});return;}res.status(201).json({success:true,schedule:await createSchedule(res.locals.user.id,projectId,workflow,cron)})}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء الجدولة.'})}});
app.post('/api/schedules/:id/disable',async(req,res)=>res.json({success:await disableSchedule(res.locals.user.id,req.params.id)}));
app.get('/api/events', (req, res) => { eventsSse(req, res); });

app.get('/api/tasks', async (req, res) => { const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined; res.json({ success:true, tasks: await listTasks(res.locals.user.id, projectId) }); });
app.get('/api/tasks/:id', async (req, res) => { const task = await getTask(req.params.id, res.locals.user.id); if(!task){res.status(404).json({success:false,error:'task not found'});return;} res.json({success:true,task}); });
app.post('/api/tasks', async (req, res) => { const message=typeof req.body?.message==='string'?req.body.message.trim():''; const projectId=typeof req.body?.projectId==='string'?req.body.projectId:null; if(!message){res.status(400).json({success:false,error:'message is required'});return;} if(projectId && !await getProject(projectId,res.locals.user.id)){res.status(404).json({success:false,error:'project not found'});return;} const task=await enqueueAgentTask(res.locals.user.id,projectId,message); res.status(202).json({success:true,task}); });
app.post('/api/tasks/:id/cancel', async (req, res) => { const task=await cancelTask(req.params.id,res.locals.user.id); if(!task){res.status(404).json({success:false,error:'task not found'});return;} res.json({success:true,task}); });
app.get('/api/workflows', async (req,res)=>{const projectId=typeof req.query.projectId==='string'?req.query.projectId:undefined;res.json({success:true,workflows:await listWorkflows(res.locals.user.id,projectId)});});
app.get('/api/workflows/:id', async (req,res)=>{const workflow=await getWorkflow(res.locals.user.id,req.params.id);if(!workflow){res.status(404).json({success:false,error:'workflow not found'});return;}res.json({success:true,workflow});});
app.post('/api/workflows', async (req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const name=typeof req.body?.name==='string'?req.body.name.trim():'';const workflow=req.body?.workflow as Workflow|undefined;if(!name||!workflow){res.status(400).json({success:false,error:'name و workflow مطلوبان'});return;}res.status(201).json({success:true,workflow:await createWorkflow(res.locals.user.id,projectId,name,workflow)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Workflow.'});}});
app.put('/api/workflows/:id', async (req,res)=>{try{const current=await getWorkflow(res.locals.user.id,req.params.id);if(!current){res.status(404).json({success:false,error:'workflow not found'});return;}const workflow=req.body?.workflow as Workflow|undefined;const name=typeof req.body?.name==='string'?req.body.name.trim():undefined;res.json({success:true,workflow:await updateWorkflow(res.locals.user.id,req.params.id,{...(name?{name}:{}),...(workflow?{workflow}:{})})});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر تحديث Workflow.'});}});
app.delete('/api/workflows/:id', async (req,res)=>res.json({success:await deleteWorkflow(res.locals.user.id,req.params.id)}));
app.post('/api/workflows/run', async (req,res) => { const workflow=req.body?.workflow as Workflow|undefined; const workflowId=typeof req.body?.workflowId==='string'?req.body.workflowId:''; const projectId=typeof req.body?.projectId==='string'?req.body.projectId:''; if(!projectId){res.status(400).json({success:false,error:'projectId مطلوب'});return;} const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;} try{const stored=workflowId?await getWorkflow(res.locals.user.id,workflowId):null;const runnable=stored?.workflow??workflow;if(!runnable){res.status(400).json({success:false,error:'workflow مطلوب أو workflowId صالح'});return;}const result=await runWorkflow(runnable,projectId);res.json({success:true,result});}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'فشل تنفيذ Workflow'});} });

app.get('/api/projects/:id/executions', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, executions: await listExecutionLogs(project.id) });
});

app.get('/api/projects/:id/memory', async (req, res) => {
  const project = await getProject(req.params.id, res.locals.user.id);
  if (!project) {
    res.status(404).json({ success: false, error: 'project not found' });
    return;
  }
  res.json({ success: true, entries: await recall(project.id) });
});

app.post('/api/sessions', async (req, res) => {
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : null;
  const session = await createSession(res.locals.user.id,projectId);
  res.status(201).json({ success: true, session });
});

app.get('/api/sessions/:id', async (req, res) => {
  const session = await getSession(res.locals.user.id,req.params.id);
  if (!session) {
    res.status(404).json({ success: false, error: 'session not found' });
    return;
  }
  res.json({ success: true, session });
});

app.post('/api/approvals/:id/approve', async (req, res) => {
  const approval = await approveRequest(res.locals.user.id,req.params.id);
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
    const request: AgentRequest = { ...body, userId: res.locals.user.id, message };
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    if (sessionId) {
      const session = await getSession(res.locals.user.id,sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: 'session not found' });
        return;
      }
      await touchSession(res.locals.user.id,sessionId);
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

void startScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BMZ AI Backend running on http://0.0.0.0:${PORT}`);
});
