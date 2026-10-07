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
import { runCommandInSandbox, makeDirectoryInSandbox, renameInSandbox, searchInSandbox } from './sandbox-tools.js';
import { listTasks, getTask } from './task-store.js';
import { enqueueAgentTask, cancelTask, runTask, pauseTask, resumeTask, retryTask } from './task-queue.js';
import { listAllTasks } from './task-store.js';
import { eventsSse } from './realtime.js';
import { runWorkflow, type Workflow } from './workflow-engine.js';
import { register, registerDevice, login, logout, authenticate, requireAuth } from './auth.js';
import { grantPermission, revokePermission, listPermissions, hasPermission } from './permission-store.js';
import { browserOpen, browserRead, browserClick, browserFill, browserClose } from './browser-service.js';
import { saveTelegramBot, telegramSend } from './telegram-integration.js';
import { listIntegrations } from './integration-registry.js';
import { githubRepo, branches, issues, pullRequests, actions, createIssue, commentIssue, createPullRequest, createBranch, createRepository } from './github-api.js';
import { startScheduler, listSchedules, createSchedule, disableSchedule } from './scheduler.js';
import { createWebhook, listWebhooks, resolveWebhook, verifyWebhookSignature } from './webhook-store.js';
import { listWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow } from './workflow-store.js';
import { startPreview, previewInfo, stopPreview, proxyPreview } from './preview-service.js';
import { createOAuthState, consumeOAuthState, exchangeGitHubCode, githubToken } from './github-auth.js';
import { connectMeta, createMetaWebhookToken, metaWebhookChallenge, sendFacebookPageMessage, sendWhatsAppMessage, resolveMetaWebhookUser } from './meta-integration.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
app.set('trust proxy', 1);
const requestCounts = new Map<string, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_GENERAL = 120;
const RATE_LIMIT_AGENT = 12;

app.use((req, res, next) => {
  const configuredKey = process.env.BMZ_API_KEY?.trim();
  const publicPath=req.path.startsWith('/api/auth/')||req.path==='/api/github/oauth/callback'||req.path.startsWith('/api/webhooks/trigger/')||req.path.startsWith('/api/meta/webhook/');
  const sessionAuthenticated = Boolean(authenticate(req));
  if (configuredKey && !publicPath && !sessionAuthenticated && req.header('x-bmz-key') !== configuredKey) {
    res.status(401).json({ success: false, error: 'مفتاح BMZ AI غير صالح أو مفقود.' });
    return;
  }

  if (req.path === '/health') {
    next();
    return;
  }
  const now = Date.now();
  const key = `${req.ip || 'unknown'}:${req.path === '/api/agent' ? 'agent' : 'general'}`;
  const limit = req.path === '/api/agent' ? RATE_LIMIT_AGENT : RATE_LIMIT_GENERAL;
  const current = requestCounts.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestCounts.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  if (current.count >= limit) {
    res.status(429).json({ success: false, error: 'تم تجاوز حد الطلبات المؤقت، يرجى المحاولة بعد قليل.' });
    return;
  }
  current.count += 1;
  next();
});

app.use(express.json({ limit: '1mb' }));

app.post('/api/auth/register', async (req,res)=>{try{const email=typeof req.body?.email==='string'?req.body.email.trim():'';const password=typeof req.body?.password==='string'?req.body.password:'';if(!/^\S+@\S+\.\S+$/.test(email)){res.status(400).json({success:false,error:'بريد إلكتروني غير صالح.'});return;}res.status(201).json({success:true,user:await register(email,password)})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر إنشاء الحساب.'})}});
app.post('/api/auth/device', async (req, res) => {
  try {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    res.status(201).json({ success: true, ...(await registerDevice(deviceId)) });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'تعذر تفعيل الجهاز.' });
  }
});
app.post('/api/auth/login', (req,res)=>{try{const email=typeof req.body?.email==='string'?req.body.email.trim():'';const password=typeof req.body?.password==='string'?req.body.password:'';res.json({success:true,...login(email,password)})}catch(error){res.status(401).json({success:false,error:error instanceof Error?error.message:'تعذر تسجيل الدخول.'})}});
app.post('/api/auth/logout',(req,res)=>{res.json({success:logout(req)})});
app.get('/api/auth/me',(req,res)=>{const user=authenticate(req);if(!user){res.status(401).json({success:false,error:'غير مسجل الدخول.'});return}res.json({success:true,user:{id:user.id,email:user.email}})});

app.get('/api/github/oauth/start', (req,res)=>{const user=authenticate(req);if(!user){res.status(401).json({success:false,error:'المصادقة مطلوبة.'});return;}const clientId=process.env.GITHUB_CLIENT_ID;const redirect=process.env.GITHUB_REDIRECT_URI;if(!clientId||!redirect){res.status(503).json({success:false,error:'GitHub OAuth غير مهيأ على الخادم.'});return;}const state=createOAuthState(user.id);const url=new URL('https://github.com/login/oauth/authorize');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',redirect);url.searchParams.set('scope','repo read:user');url.searchParams.set('state',state);res.json({success:true,url:url.toString()});});
app.get('/api/github/oauth/status',(req,res)=>{const user=authenticate(req);if(!user){res.status(401).json({success:false,error:'المصادقة مطلوبة.'});return;}res.json({success:true,connected:Boolean(githubToken(user.id))});});
app.get('/api/github/oauth/callback', async (req,res)=>{try{const state=typeof req.query.state==='string'?req.query.state:'';const code=typeof req.query.code==='string'?req.query.code:'';if(!state||!code){res.status(400).send('OAuth callback غير مكتمل.');return;}const userId=consumeOAuthState(state);await exchangeGitHubCode(userId,code);res.type('html').send('<html lang="ar" dir="rtl"><body><h2>تم ربط GitHub بنجاح.</h2><p>يمكنك العودة إلى BMZ AI.</p></body></html>');}catch(e){res.status(400).send(e instanceof Error?e.message:'فشل ربط GitHub.');}});
app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'BMZ AI Backend', status: 'ready', port: PORT });
});

// كل واجهات API بعد نقاط المصادقة العامة تتطلب جلسة مستخدم.
// الاستثناءات العامة الوحيدة هي OAuth callback وWebhook trigger لأنهما يحتاجان الوصول من GitHub/الخدمات الخارجية.
app.use('/api', (req, res, next) => {
  if (req.path === '/github/oauth/callback' || req.path.startsWith('/webhooks/trigger/') || req.path.startsWith('/meta/webhook/')) {
    next();
    return;
  }
  requireAuth(req, res, next);
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
    const imported = await importGitHubRepository(res.locals.user.id, project.id, repositoryUrl);
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

app.post('/api/projects/:id/directory',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p){res.status(404).json({success:false,error:'project not found'});return;}try{res.json({success:true,...await makeDirectoryInSandbox(p.id,String(req.body?.path??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء المجلد.'});}});
app.post('/api/projects/:id/rename',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p){res.status(404).json({success:false,error:'project not found'});return;}try{res.json({success:true,...await renameInSandbox(p.id,String(req.body?.from??''),String(req.body?.to??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إعادة التسمية.'});}});
app.get('/api/projects/:id/search',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p){res.status(404).json({success:false,error:'project not found'});return;}try{res.json({success:true,...await searchInSandbox(p.id,typeof req.query.q==='string'?req.query.q:'')});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر البحث.'});}});
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

app.post('/api/integrations/meta/connect',async(req,res)=>{
  try{
    const result=await connectMeta(res.locals.user.id,{
      pageAccessToken:typeof req.body?.pageAccessToken==='string'?req.body.pageAccessToken.trim():undefined,
      whatsappAccessToken:typeof req.body?.whatsappAccessToken==='string'?req.body.whatsappAccessToken.trim():undefined,
      whatsappPhoneNumberId:typeof req.body?.whatsappPhoneNumberId==='string'?req.body.whatsappPhoneNumberId.trim():undefined,
      verifyToken:typeof req.body?.verifyToken==='string'?req.body.verifyToken.trim():undefined
    });
    res.json({success:true,...result,webhookToken:createMetaWebhookToken(res.locals.user.id)});
  }catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر ربط Meta.'});}
});
app.post('/api/integrations/meta/facebook/send',async(req,res)=>{
  if(!await hasPermission(res.locals.user.id,null,'SEND_MESSAGE')){res.status(403).json({success:false,error:'صلاحية SEND_MESSAGE غير ممنوحة.'});return;}
  try{res.json({success:true,result:await sendFacebookPageMessage(res.locals.user.id,String(req.body?.recipientId??''),String(req.body?.text??''))});}
  catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إرسال رسالة Facebook.'});}
});
app.post('/api/integrations/meta/whatsapp/send',async(req,res)=>{
  if(!await hasPermission(res.locals.user.id,null,'SEND_MESSAGE')){res.status(403).json({success:false,error:'صلاحية SEND_MESSAGE غير ممنوحة.'});return;}
  try{res.json({success:true,result:await sendWhatsAppMessage(res.locals.user.id,String(req.body?.to??''),String(req.body?.text??''))});}
  catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إرسال رسالة WhatsApp.'});}
});
app.get('/api/meta/webhook/:token',async(req,res)=>{
  const userId=resolveMetaWebhookUser(req.params.token);
  if(!userId){res.status(403).send('invalid webhook token');return;}
  const challenge=metaWebhookChallenge(userId,String(req.query['hub.mode']??''),String(req.query['hub.verify_token']??''),String(req.query['hub.challenge']??''));
  if(challenge===null){res.status(403).send('verification failed');return;}
  res.type('text/plain').send(challenge);
});
app.post('/api/meta/webhook/:token',async(req,res)=>{
  const userId=resolveMetaWebhookUser(req.params.token);
  if(!userId){res.status(403).json({success:false,error:'invalid webhook token'});return;}
  // يتم تسليم الحدث إلى سجل الوكيل/Workflow في طبقة لاحقة؛ لا نرسل رداً آلياً غير مصرح به من هنا.
  await addExecutionLog(null,`Meta webhook received for user ${userId}: ${JSON.stringify(req.body).slice(0,5000)}`,'started');
  res.json({success:true,received:true});
});

app.get('/api/integrations',async(_req,res)=>res.json({success:true,integrations:[...listIntegrations(),{id:'telegram',name:'Telegram',version:'1.0.0',capabilities:['send_message']},{id:'facebook-pages',name:'Facebook Pages',version:'1.0.0',capabilities:['receive_messages','send_message']},{id:'whatsapp-cloud',name:'WhatsApp Cloud API',version:'1.0.0',capabilities:['receive_messages','send_message']},{id:'webhook',name:'HTTP Webhook',version:'1.0.0',capabilities:['send_message']}]}));
app.post('/api/integrations/telegram/connect',async(req,res)=>{try{await saveTelegramBot(res.locals.user.id,String(req.body?.token??''));res.json({success:true,connected:true});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر ربط Telegram.'});}});
app.post('/api/integrations/telegram/send',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'SEND_MESSAGE')){res.status(403).json({success:false,error:'صلاحية SEND_MESSAGE غير ممنوحة.'});return;}try{res.json({success:true,result:await telegramSend(res.locals.user.id,String(req.body?.chatId??''),String(req.body?.text??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إرسال الرسالة.'});}});
app.post('/api/browser/open',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'BROWSER_AUTOMATION')){res.status(403).json({success:false,error:'صلاحية BROWSER_AUTOMATION غير ممنوحة.'});return;}try{const sessionId=String(req.body?.sessionId??'');const url=String(req.body?.url??'');const allowed=Array.isArray(req.body?.allowedDomains)?req.body.allowedDomains.filter((x:any)=>typeof x==='string'):[];res.json({success:true,result:await browserOpen(res.locals.user.id,sessionId,url,allowed)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل فتح الصفحة.'});}});
app.post('/api/browser/read',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'BROWSER_AUTOMATION')){res.status(403).json({success:false,error:'صلاحية BROWSER_AUTOMATION غير ممنوحة.'});return;}try{res.json({success:true,result:await browserRead(res.locals.user.id,String(req.body?.sessionId??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل قراءة الصفحة.'});}});
app.post('/api/browser/click',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'BROWSER_AUTOMATION')){res.status(403).json({success:false,error:'صلاحية BROWSER_AUTOMATION غير ممنوحة.'});return;}try{res.json({success:true,result:await browserClick(res.locals.user.id,String(req.body?.sessionId??''),String(req.body?.selector??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل النقر.'});}});
app.post('/api/browser/fill',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'BROWSER_AUTOMATION')){res.status(403).json({success:false,error:'صلاحية BROWSER_AUTOMATION غير ممنوحة.'});return;}try{res.json({success:true,result:await browserFill(res.locals.user.id,String(req.body?.sessionId??''),String(req.body?.selector??''),String(req.body?.value??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل إدخال البيانات.'});}});
app.post('/api/browser/close',async(req,res)=>{if(!await hasPermission(res.locals.user.id,null,'BROWSER_AUTOMATION')){res.status(403).json({success:false,error:'صلاحية BROWSER_AUTOMATION غير ممنوحة.'});return;}res.json({success:await browserClose(res.locals.user.id,String(req.body?.sessionId??''))});});
app.post('/api/github/create-repository',async(req,res)=>{const approvalToken=typeof req.body?.approvalToken==='string'?req.body.approvalToken:'';if(!approvalToken||!(await consumeApproval(res.locals.user.id,approvalToken))){const approval=await requestApproval(res.locals.user.id,null,'github_create_repository','إنشاء Repository جديد على حساب GitHub عملية خارجية حساسة.');res.status(202).json({success:false,approval});return;}try{res.json({success:true,repository:await createRepository(res.locals.user.id,String(req.body?.name??''),String(req.body?.description??''),Boolean(req.body?.private))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Repository.'});}});
app.get('/api/github/repo/:id',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,repo:await githubRepo(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/branches',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,branches:await branches(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/issues',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,issues:await issues(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/prs',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,pullRequests:await pullRequests(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.get('/api/github/:id/actions',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}try{res.json({success:true,runs:await actions(res.locals.user.id,p.repositoryUrl)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'GitHub error'});}});
app.post('/api/github/:id/issue/execute',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const approvalToken=typeof req.body?.approvalToken==='string'?req.body.approvalToken:'';if(!approvalToken||!(await consumeApproval(res.locals.user.id,approvalToken))){res.status(403).json({success:false,error:'موافقة GitHub مطلوبة.'});return;}try{const title=String(req.body?.title??'').trim();const body=String(req.body?.body??'');if(!title)throw new Error('title is required');res.json({success:true,issue:await createIssue(res.locals.user.id,p.repositoryUrl,title,body)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Issue.'});}});
app.post('/api/github/:id/branch/execute',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const approvalToken=typeof req.body?.approvalToken==='string'?req.body.approvalToken:'';if(!approvalToken||!(await consumeApproval(res.locals.user.id,approvalToken))){res.status(403).json({success:false,error:'موافقة GitHub مطلوبة.'});return;}try{const name=String(req.body?.name??'').trim(),from=String(req.body?.from??'main').trim();if(!name)throw new Error('branch name is required');res.json({success:true,branch:await createBranch(res.locals.user.id,p.repositoryUrl,name,from)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Branch.'});}});
app.post('/api/github/:id/pr/execute',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const approvalToken=typeof req.body?.approvalToken==='string'?req.body.approvalToken:'';if(!approvalToken||!(await consumeApproval(res.locals.user.id,approvalToken))){res.status(403).json({success:false,error:'موافقة GitHub مطلوبة.'});return;}try{res.json({success:true,pullRequest:await createPullRequest(res.locals.user.id,p.repositoryUrl,String(req.body?.title??''),String(req.body?.body??''),String(req.body?.head??''),String(req.body?.base??'main'))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Pull Request.'});}});
app.post('/api/github/:id/issue/comment/execute',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const approvalToken=typeof req.body?.approvalToken==='string'?req.body.approvalToken:'';if(!approvalToken||!(await consumeApproval(res.locals.user.id,approvalToken))){res.status(403).json({success:false,error:'موافقة GitHub مطلوبة.'});return;}try{const number=Number(req.body?.number);if(!Number.isInteger(number)||number<1)throw new Error('رقم Issue غير صالح.');res.json({success:true,comment:await commentIssue(res.locals.user.id,p.repositoryUrl,number,String(req.body?.body??''))});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر التعليق.'});}});
app.post('/api/github/:id/issue',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const title=typeof req.body?.title==='string'?req.body.title.trim():'';const body=typeof req.body?.body==='string'?req.body.body:'';if(!title){res.status(400).json({success:false,error:'title is required'});return;}try{const approval=await requestApproval(res.locals.user.id,p.id,'github_write','إنشاء Issue على GitHub عملية كتابة خارج مساحة العمل.');res.status(202).json({success:false,approval,pending:{operation:'issue',title,body}});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر طلب الموافقة.'});}});
app.post('/api/github/:id/branch',async(req,res)=>{const p=await getProject(req.params.id,res.locals.user.id);if(!p?.repositoryUrl){res.status(404).json({success:false,error:'project not linked to GitHub'});return;}const name=typeof req.body?.name==='string'?req.body.name.trim():'';const from=typeof req.body?.from==='string'?req.body.from.trim():'main';if(!/^[A-Za-z0-9._\\/-]{1,80}$/.test(name)){res.status(400).json({success:false,error:'اسم الفرع غير صالح.'});return;}const approval=await requestApproval(res.locals.user.id,p.id,'github_write','إنشاء Branch على GitHub يتطلب موافقة صريحة.');res.status(202).json({success:false,approval,pending:{operation:'branch',name,from}});});
app.get('/api/permissions', async (req,res)=>{res.json({success:true,permissions:await listPermissions(res.locals.user.id)});});
app.post('/api/permissions', async (req,res)=>{try{const permission=req.body?.permission as any;const allowed=['READ_PROJECT','WRITE_PROJECT','DELETE_FILE','RUN_COMMAND','NETWORK_ACCESS','GITHUB_READ','GITHUB_WRITE','GITHUB_PUSH','GITHUB_MERGE','SEND_MESSAGE','BROWSER_AUTOMATION','SCHEDULE_WORKFLOW'];if(!allowed.includes(permission)){res.status(400).json({success:false,error:'صلاحية غير معروفة.'});return;}const projectId=typeof req.body?.projectId==='string'?req.body.projectId:null;res.status(201).json({success:true,permission:await grantPermission(res.locals.user.id,projectId,permission,typeof req.body?.scope==='string'?req.body.scope:undefined)});}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'تعذر منح الصلاحية.'})}});
app.delete('/api/permissions/:id', async (req,res)=>{res.json({success:await revokePermission(req.params.id,res.locals.user.id)});});
app.post('/api/webhooks',async(req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const workflow=req.body?.workflow as Workflow|undefined;if(!workflow){res.status(400).json({success:false,error:'workflow مطلوب'});return;}res.status(201).json({success:true,webhook:await createWebhook(res.locals.user.id,projectId,workflow)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Webhook.'});}});
app.get('/api/webhooks',async(req,res)=>res.json({success:true,webhooks:await listWebhooks(res.locals.user.id)}));

app.post('/api/webhooks/trigger/:token',async(req,res)=>{const hook=await resolveWebhook(req.params.token);if(!hook){res.status(404).json({success:false,error:'webhook not found'});return;}const signature=req.header('x-bmz-signature');if(!signature){res.status(401).json({success:false,error:'X-BMZ-Signature مطلوب.'});return;}const raw=JSON.stringify(req.body??{});if(!verifyWebhookSignature(req.params.token,raw,signature)){res.status(401).json({success:false,error:'توقيع Webhook غير صالح.'});return;}try{const result=await runWorkflow(hook.workflow,hook.projectId,hook.userId);res.json({success:true,result})}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'فشل تشغيل Workflow.'})}});
app.get('/api/schedules',async(req,res)=>{res.json({success:true,schedules:await listSchedules(res.locals.user.id)})});
app.post('/api/schedules',async(req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const cron=typeof req.body?.cron==='string'?req.body.cron.trim():'';const workflow=req.body?.workflow as Workflow|undefined;if(!cron||!workflow){res.status(400).json({success:false,error:'cron و workflow مطلوبان'});return;}res.status(201).json({success:true,schedule:await createSchedule(res.locals.user.id,projectId,workflow,cron)})}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء الجدولة.'})}});
app.post('/api/schedules/:id/disable',async(req,res)=>res.json({success:await disableSchedule(res.locals.user.id,req.params.id)}));
app.get('/api/events', (req, res) => { eventsSse(req, res); });

app.get('/api/tasks', async (req, res) => { const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined; res.json({ success:true, tasks: await listTasks(res.locals.user.id, projectId) }); });
app.post('/api/tasks/:id/pause',async(req,res)=>{const task=await pauseTask(req.params.id,res.locals.user.id);if(!task){res.status(404).json({success:false,error:'task not found'});return;}res.json({success:true,task});});
app.post('/api/tasks/:id/resume',async(req,res)=>{const task=await resumeTask(req.params.id,res.locals.user.id);if(!task){res.status(404).json({success:false,error:'task not found'});return;}res.json({success:true,task});});
app.post('/api/tasks/:id/retry',async(req,res)=>{const task=await retryTask(req.params.id,res.locals.user.id);if(!task){res.status(404).json({success:false,error:'task not found'});return;}res.json({success:true,task});});
app.get('/api/tasks/:id', async (req, res) => { const task = await getTask(req.params.id, res.locals.user.id); if(!task){res.status(404).json({success:false,error:'task not found'});return;} res.json({success:true,task}); });
app.post('/api/tasks', async (req, res) => { const message=typeof req.body?.message==='string'?req.body.message.trim():''; const projectId=typeof req.body?.projectId==='string'?req.body.projectId:null; if(!message){res.status(400).json({success:false,error:'message is required'});return;} if(projectId && !await getProject(projectId,res.locals.user.id)){res.status(404).json({success:false,error:'project not found'});return;} const task=await enqueueAgentTask(res.locals.user.id,projectId,message); res.status(202).json({success:true,task}); });
app.post('/api/tasks/:id/cancel', async (req, res) => { const task=await cancelTask(req.params.id,res.locals.user.id); if(!task){res.status(404).json({success:false,error:'task not found'});return;} res.json({success:true,task}); });
app.get('/api/workflows', async (req,res)=>{const projectId=typeof req.query.projectId==='string'?req.query.projectId:undefined;res.json({success:true,workflows:await listWorkflows(res.locals.user.id,projectId)});});
app.get('/api/workflows/:id', async (req,res)=>{const workflow=await getWorkflow(res.locals.user.id,req.params.id);if(!workflow){res.status(404).json({success:false,error:'workflow not found'});return;}res.json({success:true,workflow});});
app.post('/api/workflows', async (req,res)=>{try{const projectId=typeof req.body?.projectId==='string'?req.body.projectId:'';const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;}const name=typeof req.body?.name==='string'?req.body.name.trim():'';const workflow=req.body?.workflow as Workflow|undefined;if(!name||!workflow){res.status(400).json({success:false,error:'name و workflow مطلوبان'});return;}res.status(201).json({success:true,workflow:await createWorkflow(res.locals.user.id,projectId,name,workflow)});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر إنشاء Workflow.'});}});
app.put('/api/workflows/:id', async (req,res)=>{try{const current=await getWorkflow(res.locals.user.id,req.params.id);if(!current){res.status(404).json({success:false,error:'workflow not found'});return;}const workflow=req.body?.workflow as Workflow|undefined;const name=typeof req.body?.name==='string'?req.body.name.trim():undefined;res.json({success:true,workflow:await updateWorkflow(res.locals.user.id,req.params.id,{...(name?{name}:{}),...(workflow?{workflow}:{})})});}catch(e){res.status(400).json({success:false,error:e instanceof Error?e.message:'تعذر تحديث Workflow.'});}});
app.delete('/api/workflows/:id', async (req,res)=>res.json({success:await deleteWorkflow(res.locals.user.id,req.params.id)}));
app.post('/api/workflows/run', async (req,res) => { const workflow=req.body?.workflow as Workflow|undefined; const workflowId=typeof req.body?.workflowId==='string'?req.body.workflowId:''; const projectId=typeof req.body?.projectId==='string'?req.body.projectId:''; if(!projectId){res.status(400).json({success:false,error:'projectId مطلوب'});return;} const project=await getProject(projectId,res.locals.user.id);if(!project){res.status(404).json({success:false,error:'project not found'});return;} try{const stored=workflowId?await getWorkflow(res.locals.user.id,workflowId):null;const runnable=stored?.workflow??workflow;if(!runnable){res.status(400).json({success:false,error:'workflow مطلوب أو workflowId صالح'});return;}const result=await runWorkflow(runnable,projectId,res.locals.user.id);res.json({success:true,result});}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'فشل تنفيذ Workflow'});} });

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
    if (request.projectId) {
      const ownedProject = await getProject(request.projectId, res.locals.user.id);
      if (!ownedProject) {
        res.status(404).json({ success: false, error: 'project not found or not owned by this user' });
        return;
      }
    }
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
if(process.env.BMZ_EMBED_WORKER!=='false'){
  const poll=async()=>{const tasks=await listAllTasks();await Promise.all(tasks.filter(t=>t.status==='pending').slice(0,2).map(t=>runTask(t.id,t.userId)));};
  void poll();
  setInterval(()=>{void poll();},Math.max(1000,Number(process.env.BMZ_WORKER_POLL_MS??1500)));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BMZ AI Backend running on http://0.0.0.0:${PORT}`);
});
