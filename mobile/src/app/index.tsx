import React,{useEffect,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {Linking} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL='https://bmz-ai-backend.onrender.com';
const CONFIGURED_API_URL=normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL?.trim()||DEFAULT_API_URL);
const REQUEST_TIMEOUT_MS=20000;

function normalizeApiUrl(value:string){
 const endpoint=value.trim().replace(/\/$/,'');
 if(!endpoint)return '';
 let url:URL;
 try{url=new URL(endpoint);}catch{throw new Error('عنوان Backend غير صالح. استخدم عنوانًا عامًا يبدأ بـ https://.');}
 if(url.protocol!=='https:')throw new Error('يجب أن يعمل Backend عبر HTTPS. لا تستخدم localhost أو 192.168.x.x أو أي عنوان جهاز محلي.');
 const host=url.hostname.toLowerCase();
 if(host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host.endsWith('.local')||/^10\\./.test(host)||/^192\\.168\\./.test(host)||/^172\\.(1[6-9]|2[0-9]|3[0-1])\\./.test(host))throw new Error('عنوان Backend محلي وغير صالح للنسخة المثبتة على Android. استخدم خادمًا عامًا عبر HTTPS.');
 return endpoint;
}
type Tab='home'|'files'|'terminal'|'plan'|'logs'|'preview'|'memory'|'workflows'|'integrations'|'settings';
type Msg={id:number,role:'user'|'agent',text:string};
type Approval={id:string,reason:string};
type PlanStep={id:string,title:string,status:string};
type Execution={status:string,message:string,iterations:number,observations:any[]};

export default function HomeScreen(){
 const [token,setToken]=useState<string|null>(null),[booting,setBooting]=useState(true),[connectionError,setConnectionError]=useState('');
 const [projectId,setProjectId]=useState<string|null>(null),[sessionId,setSessionId]=useState<string|null>(null);
 const [apiBase,setApiBase]=useState(CONFIGURED_API_URL),[repo,setRepo]=useState(''),[projectName,setProjectName]=useState('مشروع BMZ AI');
 const [projects,setProjects]=useState<any[]>([]),[message,setMessage]=useState(''),[sending,setSending]=useState(false);
 const [files,setFiles]=useState<string[]>([]),[selected,setSelected]=useState(''),[code,setCode]=useState('');
 const [tab,setTab]=useState<Tab>('home'),[logs,setLogs]=useState<Msg[]>([]),[approval,setApproval]=useState<Approval|null>(null);
 const [plan,setPlan]=useState<{goal:string,steps:PlanStep[]}|null>(null),[execution,setExecution]=useState<Execution|null>(null);
 const [memory,setMemory]=useState<any[]>([]),[executions,setExecutions]=useState<any[]>([]);
 const [terminalCommand,setTerminalCommand]=useState(''),[terminalArgs,setTerminalArgs]=useState(''),[terminalOut,setTerminalOut]=useState('');
 const [buildStatus,setBuildStatus]=useState(''),[artifactAvailable,setArtifactAvailable]=useState(false),[commitStatus,setCommitStatus]=useState('');
 const [showNewProject,setShowNewProject]=useState(false),[showSettings,setShowSettings]=useState(false);
 const [workflows,setWorkflows]=useState<any[]>([]),[workflowNodes,setWorkflowNodes]=useState<any[]>([]),[workflowName,setWorkflowName]=useState('Workflow جديد'),[workflowBusy,setWorkflowBusy]=useState(false),[integrations,setIntegrations]=useState<any[]>([]),[permissions,setPermissions]=useState<any[]>([]),[previewUrl,setPreviewUrl]=useState('');

 const base=projectId?apiBase+'/api/projects/'+projectId:'';

 function updateApiBase(value:string){setApiBase(value);try{const normalized=normalizeApiUrl(value);if(normalized)void SecureStore.setItemAsync('bmz_api_base',normalized);}catch{}}
 async function apiFetch(url:string,init?:RequestInit){
  const headers=new Headers(init?.headers);
  if(token)headers.set('Authorization','Bearer '+token);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{return await fetch(url,{...init,headers,signal:controller.signal});}
  catch(error){
    if(error instanceof Error && error.name==='AbortError') throw new Error('تعذر الاتصال بالخادم: انتهت مهلة الاتصال (15 ثانية). تأكد من عنوان Backend وأنه يعمل عبر HTTPS.');
    if(error instanceof TypeError) throw new Error('تعذر الاتصال بالخادم. تحقق من عنوان Backend واتصال الإنترنت. لا تستخدم عنوانًا محليًا مثل 192.168.x.x في النسخة المثبتة على الهاتف.');
    throw error;
  } finally{clearTimeout(timer);}
 }
 async function activateDevice(endpoint:string,deviceId:string){
  const r=await apiFetch(endpoint+'/api/auth/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.token)throw new Error(d.error||'تعذر تفعيل هذا الجهاز.');
  await SecureStore.setItemAsync('bmz_auth_token',d.token);
  await SecureStore.setItemAsync('bmz_api_base',endpoint);
  setToken(d.token);
}
 useEffect(()=>{
  void (async()=>{
   setBooting(true);setConnectionError('');
   try{
    const [savedToken,savedApiBase,savedDeviceId]=await Promise.all([
      SecureStore.getItemAsync('bmz_auth_token'),
      SecureStore.getItemAsync('bmz_api_base'),
      SecureStore.getItemAsync('bmz_device_id')
    ]);
    const endpoint=normalizeApiUrl(savedApiBase||CONFIGURED_API_URL);
    const deviceId=savedDeviceId||('android-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14));
    if(!savedDeviceId)await SecureStore.setItemAsync('bmz_device_id',deviceId);
    if(!endpoint)throw new Error('لم يتم ضبط عنوان Backend. استخدم عنوانًا عامًا عبر HTTPS في إعدادات بناء التطبيق.');
    setApiBase(endpoint);
    if(savedToken){setToken(savedToken);return;}
    await activateDevice(endpoint,deviceId);
   }catch(e){setConnectionError(e instanceof Error?e.message:'تعذر الاتصال بالخادم.')}
   finally{setBooting(false);}
  })();
 },[]);
 useEffect(()=>{if(token){void SecureStore.setItemAsync('bmz_auth_token',token);void loadProjects();}},[token]);
 useEffect(()=>{if(!projectId)return;void refreshAll();const timer=setInterval(()=>{void refreshAll();},3000);return()=>clearInterval(timer);},[projectId,token]);

 async function loadProjects(){try{const r=await apiFetch(apiBase+'/api/projects');const d=await r.json();if(r.ok)setProjects(d.projects||[]);}catch{}}
 async function refreshFiles(pid=projectId){if(!pid)return;try{const r=await apiFetch(apiBase+'/api/projects/'+pid+'/files');const d=await r.json();if(r.ok)setFiles(d.files||[]);}catch{}}
 async function refreshBuild(){if(!projectId)return;try{const r=await apiFetch(base+'/github/build');const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر قراءة البناء.');if(!d.found){setBuildStatus('لا يوجد بناء بعد.');setArtifactAvailable(false);return;}const run=d.run;setArtifactAvailable(Boolean(d.artifact));setBuildStatus(run.status==='completed'?(run.conclusion==='success'?'البناء ناجح — APK متاح.':'البناء فشل.'):'البناء قيد التنفيذ...');}catch(e){setBuildStatus(e instanceof Error?e.message:'تعذر قراءة البناء.');}}
 async function refreshMemory(){if(!projectId)return;try{const r=await apiFetch(base+'/memory');const d=await r.json();if(r.ok)setMemory(d.entries||[]);}catch{}}
 async function refreshExecutions(){if(!projectId)return;try{const r=await apiFetch(base+'/executions');const d=await r.json();if(r.ok)setExecutions(d.executions||[]);}catch{}}
 async function startPreview(){if(!projectId)return;try{const r=await apiFetch(apiBase+'/api/projects/'+encodeURIComponent(projectId)+'/preview/start',{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تشغيل Preview.');const url=apiBase+d.preview.urlPath+'?token='+encodeURIComponent(d.preview.token);setPreviewUrl(url);await Linking.openURL(url);}catch(e){Alert.alert('Preview',e instanceof Error?e.message:'تعذر تشغيل Preview.')}}
 async function refreshIntegrations(){try{const r=await apiFetch(apiBase+'/api/integrations');const d=await r.json();if(r.ok)setIntegrations(d.integrations||[]);const p=await apiFetch(apiBase+'/api/permissions');const pd=await p.json();if(p.ok)setPermissions(pd.permissions||[]);}catch{}}
 async function refreshWorkflows(){if(!projectId)return;try{const r=await apiFetch(apiBase+'/api/workflows?projectId='+encodeURIComponent(projectId));const d=await r.json();if(r.ok)setWorkflows(d.workflows||[]);}catch{}}
 async function refreshAll(){await Promise.all([refreshFiles(),refreshBuild(),refreshMemory(),refreshExecutions(),refreshWorkflows(),refreshIntegrations()]);}

 async function selectProject(id:string){setProjectId(id);setSessionId(null);setSelected('');setCode('');setTab('home');}
 async function ensureProject(){
  if(projectId)return projectId;
  const endpoint=repo.trim()?apiBase+'/api/projects/import-github':apiBase+'/api/projects';
  const r=await apiFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:projectName.trim()||'مشروع BMZ AI',...(repo.trim()?{repositoryUrl:repo.trim()}:{})})});
  const d=await r.json();if(!r.ok||!d.project?.id)throw new Error(d.error||'تعذر إنشاء المشروع.');
  setProjectId(d.project.id);await loadProjects();return d.project.id;
 }
 async function ensureSession(pid:string){if(sessionId)return sessionId;const r=await apiFetch(apiBase+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر إنشاء الجلسة.');setSessionId(d.session.id);return d.session.id;}
 async function openFile(path:string){if(!projectId)return;try{const r=await apiFetch(base+'/file?path='+encodeURIComponent(path));const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر قراءة الملف.');setSelected(path);setCode(d.content||'');setTab('files');}catch(e){Alert.alert('خطأ',e instanceof Error?e.message:'تعذر قراءة الملف.');}}
 async function saveFile(){if(!projectId||!selected)return;const r=await apiFetch(base+'/file',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:selected,content:code})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر الحفظ.');setCommitStatus('تم حفظ الملف في مساحة العمل.');await refreshFiles();}
 async function send(textOverride?:string,approvalToken?:string){
  const text=(textOverride??message).trim();if(!text||sending)return;setSending(true);setMessage('');
  setLogs(x=>[...x,{id:Date.now(),role:'user',text}]);setTab('logs');
  try{const pid=await ensureProject();const sid=await ensureSession(pid);const r=await apiFetch(apiBase+'/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,projectId:pid,sessionId:sid,...(approvalToken?{permissionLevel:'approval_required',approvalToken}:{})})});const d=await r.json();
   if(d.plan)setPlan(d.plan);if(d.execution)setExecution(d.execution);
   if(d.approval){setApproval(d.approval);setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:'مطلوب موافقة: '+d.approval.reason}]);return;}
   if(!r.ok||!d.success)throw new Error(d.error||d.execution?.message||'فشل التنفيذ.');
   const summary=[d.assistantMessage||d.execution?.message||'اكتمل التنفيذ.',...(d.execution?.observations||[]).map((o:any)=>(o.ok?'✓ ':'✗ ')+o.summary)].join('\n');
   setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:summary}]);await refreshAll();
  }catch(e){setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:e instanceof Error?e.message:'حدث خطأ.'}]);}
  finally{setSending(false);}
 }
 async function runTerminal(){
  if(!projectId||!terminalCommand.trim())return;setTerminalOut('جاري التنفيذ...');
  try{const args=terminalArgs.trim()?terminalArgs.trim().split(/\s+/):[];const r=await apiFetch(base+'/terminal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:terminalCommand.trim(),args})});const d=await r.json();setTerminalOut((d.result?.stdout||'')+(d.result?.stderr?'\n'+d.result.stderr:'')+(d.error?'\n'+d.error:''));await refreshAll();}catch(e){setTerminalOut(e instanceof Error?e.message:'تعذر تنفيذ الأمر.');}
 }
 async function addWorkflowNode(type:string){setWorkflowNodes(x=>[...x,{id:'node-'+Date.now()+'-'+x.length,type,config:type==='RunCommand'?{command:'npm',args:['test']}:type==='Log'?{message:'BMZ AI workflow'}:{}}]);}
 async function saveWorkflow(){if(!projectId||!workflowNodes.length)return;setWorkflowBusy(true);try{const edges=workflowNodes.slice(1).map((n,i)=>({from:workflowNodes[i].id,to:n.id}));const workflow={id:'',name:workflowName,nodes:workflowNodes,edges};const r=await apiFetch(apiBase+'/api/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,name:workflowName,workflow})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر حفظ Workflow.');setWorkflows(x=>[...x,d.workflow]);}catch(e){Alert.alert('Workflow',e instanceof Error?e.message:'تعذر حفظ Workflow.')}finally{setWorkflowBusy(false)}}
 async function runSavedWorkflow(item:any){if(!projectId)return;setWorkflowBusy(true);try{const r=await apiFetch(apiBase+'/api/workflows/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,workflowId:item.id})});const d=await r.json();setLogs(x=>[...x,{id:Date.now(),role:'agent',text:r.ok?'✓ تم تنفيذ Workflow فعليًا.\n'+JSON.stringify(d.result):'✗ '+(d.error||'فشل التنفيذ.')}]);}finally{setWorkflowBusy(false)}}
 async function connectGithub(){try{const r=await apiFetch(apiBase+'/api/github/oauth/start');const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر بدء ربط GitHub.');await Linking.openURL(d.url);}catch(e){Alert.alert('GitHub',e instanceof Error?e.message:'تعذر بدء الربط.');}}
 async function refreshGithubStatus(){try{const r=await apiFetch(apiBase+'/api/github/oauth/status');const d=await r.json();if(r.ok)setCommitStatus(d.connected?'GitHub مرتبط.':'GitHub غير مرتبط.');}catch{}}
 async function commit(){if(!projectId)return;const r=await apiFetch(base+'/github/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'BMZ AI: تحديث المشروع'})});const d=await r.json();if(d.approval){setApproval(d.approval);setCommitStatus('تحتاج العملية إلى موافقة.');return;}setCommitStatus(r.ok?'تم إرسال التغييرات إلى GitHub.':'خطأ: '+(d.error||'فشل Commit'));await refreshBuild();}
 async function approve(){if(!approval)return;const id=approval.id;const r=await apiFetch(apiBase+'/api/approvals/'+id+'/approve',{method:'POST'});if(!r.ok){Alert.alert('خطأ','تعذر تسجيل الموافقة.');return;}setApproval(null);const last=logs.filter(x=>x.role==='user').at(-1)?.text;if(last)await send(last,id);}
 const quick=[
  ['🔍 فحص المشروع','افحص المشروع كاملًا، اقرأ الملفات المهمة، واكتشف المشاكل دون حذف شيء.'],
  ['🛠 إصلاح','افحص الأخطاء الحالية وأصلحها ثم اختبر النتيجة.'],
  ['🧪 اختبار','اختبر المشروع وشغّل الاختبارات المناسبة وأصلح أي خطأ يظهر.'],
  ['📱 Android','افحص تطبيق Android وابنه ثم تحقق من APK.'],
  ['📁 الملفات','اعرض بنية الملفات المهمة واشرح ما يحتاج إلى تعديل.'],
 ];
 const nav:[Tab,string][]=[['home','الرئيسية'],['files','الملفات'],['terminal','Terminal'],['plan','الخطة'],['logs','السجل'],['preview','المعاينة'],['memory','الذاكرة'],['workflows','Workflow'],['integrations','التكاملات'],['settings','الإعدادات']];
 const selectedContent=selected?code:'';
 if(booting)return <SafeAreaView style={s.safe}><View style={s.auth}><Text style={s.brand}>BMZ AI</Text><Text style={s.hero}>جاري تشغيل BMZ AI</Text><Text style={s.heroSub}>يتم تفعيل هذا الهاتف تلقائيًا. لا يوجد تسجيل دخول أو إنشاء حساب.</Text></View></SafeAreaView>;
 if(!token)return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.auth}><Text style={s.brand}>BMZ AI</Text><Text style={s.hero}>تعذر الاتصال بالخادم</Text><Text style={s.heroSub}>{connectionError||'تحقق من عنوان Backend واتصال الإنترنت.'}</Text><TextInput style={s.input} value={apiBase} onChangeText={updateApiBase} placeholder="عنوان Backend عبر HTTPS" placeholderTextColor="#71857D" autoCapitalize="none" autoCorrect={false} keyboardType="url"/><Pressable style={s.primary} onPress={()=>{setBooting(true);setConnectionError('');void (async()=>{try{const deviceId=(await SecureStore.getItemAsync('bmz_device_id'))||('android-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14));await SecureStore.setItemAsync('bmz_device_id',deviceId);await activateDevice(normalizeApiUrl(apiBase),deviceId);}catch(e){setConnectionError(e instanceof Error?e.message:'تعذر الاتصال بالخادم.')}finally{setBooting(false);}})();}}><Text style={s.primaryText}>إعادة الاتصال</Text></Pressable></ScrollView></SafeAreaView>;
 return <SafeAreaView style={s.safe}><StatusBar barStyle="light-content" backgroundColor="#07110D"/><KeyboardAvoidingView style={s.fill} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.top}><View><Text style={s.brand}>BMZ AI</Text><Text style={s.subtitle}>وكيل تطوير حقيقي — خطط، نفّذ، اختبر، أصلح</Text></View><View style={s.statusDot}/></View>
  {!projectId?<ScrollView contentContainerStyle={s.start}>
    <Text style={s.hero}>ماذا تريد أن نبني؟</Text><Text style={s.heroSub}>اكتب طلبك بلغة طبيعية، وBMZ AI يتولى التخطيط والتنفيذ داخل Sandbox.</Text>
    <TextInput value={apiBase} onChangeText={updateApiBase} autoCapitalize="none" autoCorrect={false} placeholder="عنوان Backend" placeholderTextColor="#718078" style={s.input}/>
    <TextInput value={message} onChangeText={setMessage} placeholder="اكتب الأمر هنا... مثال: افحص المشروع وأصلح كل الأخطاء ثم اختبره" placeholderTextColor="#718078" style={s.command} multiline/>
    <Pressable onPress={()=>void send()} disabled={!message.trim()||sending} style={s.primary}><Text style={s.primaryText}>{sending?'جارٍ التنفيذ…':'▶ تنفيذ الأمر'}</Text></Pressable>
    <View style={s.quick}>{quick.map(([t,v])=><Pressable key={t} onPress={()=>setMessage(v)} style={s.chip}><Text style={s.chipText}>{t}</Text></Pressable>)}</View>
    {projects.length>0&&<><Text style={s.section}>مشاريعك</Text>{projects.map(p=><Pressable key={p.id} onPress={()=>selectProject(p.id)} style={s.project}><Text style={s.projectName}>{p.name}</Text><Text style={s.projectRepo}>{p.repositoryUrl||'مشروع محلي'}</Text></Pressable>)}</>}
    <Pressable onPress={()=>setShowNewProject(v=>!v)} style={s.secondary}><Text style={s.secondaryText}>{showNewProject?'إلغاء':'＋ إنشاء مشروع جديد'}</Text></Pressable>
    {showNewProject&&<View style={s.card}><TextInput value={projectName} onChangeText={setProjectName} placeholder="اسم المشروع" placeholderTextColor="#718078" style={s.input}/><TextInput value={repo} onChangeText={setRepo} placeholder="رابط GitHub اختياري" placeholderTextColor="#718078" style={s.input}/><Pressable onPress={()=>void ensureProject()} style={s.primary}><Text style={s.primaryText}>إنشاء وفتح المشروع</Text></Pressable></View>}
  </ScrollView>:
  <>
   <View style={s.projectBar}><Text style={s.projectTitle}>{projects.find(p=>p.id===projectId)?.name||'المشروع الحالي'}</Text><Pressable onPress={()=>setProjectId(null)}><Text style={s.change}>تغيير المشروع</Text></Pressable></View>
   <View style={s.nav}>{nav.map(([id,label])=><Pressable key={id} onPress={()=>setTab(id)} style={[s.navItem,tab===id&&s.navActive]}><Text style={[s.navText,tab===id&&s.navTextActive]}>{label}</Text></Pressable>)}</View>
   <View style={s.content}>
    {tab==='home'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>مركز الأوامر</Text><Text style={s.pageSub}>اكتب ما تريد من BMZ AI تنفيذه. لا تحتاج إلى معرفة البرمجة.</Text><TextInput value={message} onChangeText={setMessage} placeholder="مثال: افحص المشروع بالكامل ثم أصلح كل الأخطاء وابنِ APK" placeholderTextColor="#718078" style={s.command} multiline/><Pressable onPress={()=>void send()} disabled={!message.trim()||sending} style={s.primary}><Text style={s.primaryText}>{sending?'جارٍ العمل…':'▶ تنفيذ الأمر'}</Text></Pressable><View style={s.quick}>{quick.map(([t,v])=><Pressable key={t} onPress={()=>{setMessage(v);setTab('home')}} style={s.chip}><Text style={s.chipText}>{t}</Text></Pressable>)}</View>{execution&&<View style={s.card}><Text style={s.cardTitle}>آخر نتيجة</Text><Text style={s.cardText}>{execution.message}</Text><Text style={s.muted}>العمليات: {execution.iterations}</Text></View>}<View style={s.row}><Pressable onPress={()=>void refreshBuild()} style={s.secondary}><Text style={s.secondaryText}>تحديث حالة APK</Text></Pressable>{artifactAvailable&&<Pressable onPress={()=>void Linking.openURL(base+'/github/build/apk')} style={s.primarySmall}><Text style={s.primaryText}>تنزيل APK</Text></Pressable>}</View><Text style={s.status}>{buildStatus}</Text></ScrollView>}
    {tab==='files'&&<View style={s.flex}><View style={s.fileHeader}><Text style={s.pageTitle}>ملفات المشروع ({files.length})</Text><Pressable onPress={()=>void refreshFiles()}><Text style={s.change}>تحديث</Text></Pressable></View><ScrollView>{files.map(p=><Pressable key={p} onPress={()=>void openFile(p)} style={s.file}><Text style={s.fileText}>{p}</Text></Pressable>)}</ScrollView>{selected&&<View style={s.editorBox}><Text style={s.cardTitle}>{selected}</Text><TextInput value={selectedContent} onChangeText={setCode} multiline style={s.editor} textAlign="left"/><Pressable onPress={()=>void saveFile()} style={s.primarySmall}><Text style={s.primaryText}>حفظ الملف</Text></Pressable></View>}</View>}
    {tab==='terminal'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>Terminal</Text><Text style={s.pageSub}>تنفيذ أوامر مسموحة داخل Sandbox للمشروع الحالي.</Text><TextInput value={terminalCommand} onChangeText={setTerminalCommand} placeholder="الأمر: npm / npx / tsc / gradle" placeholderTextColor="#718078" style={s.input}/><TextInput value={terminalArgs} onChangeText={setTerminalArgs} placeholder="المعطيات: run build" placeholderTextColor="#718078" style={s.input}/><View style={s.quick}>{['npm run build','npm test','npm install','npx tsc','gradle --version'].map(x=><Pressable key={x} onPress={()=>{const a=x.split(' ');setTerminalCommand(a.shift()||'');setTerminalArgs(a.join(' '))}} style={s.chip}><Text style={s.chipText}>{x}</Text></Pressable>)}</View><Pressable onPress={()=>void runTerminal()} style={s.primary}><Text style={s.primaryText}>▶ تنفيذ في Sandbox</Text></Pressable><Text style={s.terminal}>{terminalOut||'ستظهر المخرجات هنا…'}</Text></ScrollView>}
    {tab==='plan'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>خطة التنفيذ</Text>{plan?<><Text style={s.cardText}>{plan.goal}</Text>{plan.steps.map((x,i)=><View key={x.id} style={s.step}><Text style={s.stepNum}>{i+1}</Text><View style={s.flex}><Text style={s.stepTitle}>{x.title}</Text><Text style={s.muted}>{x.status}</Text></View></View>)}</>:<Text style={s.empty}>أرسل أمرًا ليُنشئ BMZ AI خطة تنفيذ.</Text>}</ScrollView>}
    {tab==='logs'&&<ScrollView contentContainerStyle={s.pad}>{logs.map(m=><View key={m.id} style={[s.log,m.role==='user'&&s.userLog]}><Text style={s.muted}>{m.role==='user'?'أنت':'BMZ AI'}</Text><Text style={s.logText}>{m.text}</Text></View>)}{executions.map((x,i)=><View key={'e'+i} style={s.log}><Text style={s.muted}>{x.status||'execution'}</Text><Text style={s.logText}>{x.message||x.summary||JSON.stringify(x)}</Text></View>)}</ScrollView>}
    {tab==='preview'&&<View style={s.preview}><Text style={s.previewText}>{previewUrl?'تم تشغيل Preview حقيقي داخل Sandbox.':'شغّل التطبيق داخل Sandbox لفتح Preview تفاعلي.'}</Text>{projectId&&<Pressable onPress={()=>void startPreview()} style={s.primarySmall}><Text style={s.primaryText}>{previewUrl?'إعادة فتح Preview':'تشغيل Preview'}</Text></Pressable>}{previewUrl&&<Pressable onPress={()=>void Linking.openURL(previewUrl)} style={s.secondary}><Text style={s.secondaryText}>فتح Preview التفاعلي</Text></Pressable>}</View>}
    {tab==='workflows'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>Workflow Automation</Text><Text style={s.pageSub}>منشئ Workflow فعلي؛ العقد التي تضيفها تُحفظ وتُنفذ في Backend.</Text><TextInput value={workflowName} onChangeText={setWorkflowName} placeholder="اسم Workflow" placeholderTextColor="#718078" style={s.input}/><Text style={s.cardTitle}>إضافة عقدة</Text><View style={s.quick}>{['ManualTrigger','RunCommand','ReadFile','WriteFile','DeleteFile','Condition','Delay','HttpRequest','Log'].map(type=><Pressable key={type} onPress={()=>void addWorkflowNode(type)} style={s.chip}><Text style={s.chipText}>＋ {type}</Text></Pressable>)}</View>{workflowNodes.map((n,i)=><View key={n.id} style={s.step}><Text style={s.stepNum}>{i+1}</Text><View style={s.flex}><Text style={s.stepTitle}>{n.type}</Text><Text style={s.muted}>{i>0?'متصل بالعقدة السابقة':'بداية التدفق'}</Text></View></View>)}<Pressable disabled={workflowBusy||!workflowNodes.length} onPress={()=>void saveWorkflow()} style={s.primary}><Text style={s.primaryText}>حفظ Workflow وتشغيله لاحقًا</Text></Pressable><Text style={s.cardTitle}>Workflows المحفوظة</Text>{workflows.map(w=><View key={w.id} style={s.card}><Text style={s.cardTitle}>{w.name}</Text><Text style={s.muted}>{w.workflow?.nodes?.length||0} عقد</Text><Pressable onPress={()=>void runSavedWorkflow(w)} style={s.secondary}><Text style={s.secondaryText}>▶ تشغيل فعلي</Text></Pressable></View>)}</ScrollView>}
    {tab==='integrations'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>التكاملات والصلاحيات</Text><Text style={s.pageSub}>كل تكامل وصلاحية يُدار من Backend ولا يُمنح للوكيل تلقائيًا.</Text>{integrations.map(x=><View key={x.id} style={s.card}><Text style={s.cardTitle}>{x.name}</Text><Text style={s.muted}>{(x.capabilities||[]).join(' • ')}</Text></View>)}<Text style={s.cardTitle}>الصلاحيات الحالية</Text>{permissions.map(x=><View key={x.id} style={s.step}><Text style={s.stepNum}>✓</Text><View style={s.flex}><Text style={s.stepTitle}>{x.permission}</Text><Text style={s.muted}>{x.scope||'عام'}</Text></View></View>)}</ScrollView>}
    {tab==='memory'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>ذاكرة المشروع</Text>{memory.length?memory.map((x,i)=><View key={i} style={s.log}><Text style={s.muted}>{x.kind||x.type||'memory'}</Text><Text style={s.logText}>{x.content||x.value||JSON.stringify(x)}</Text></View>):<Text style={s.empty}>لا توجد ذكريات محفوظة بعد.</Text>}</ScrollView>}
    {tab==='settings'&&<ScrollView contentContainerStyle={s.pad}><Text style={s.pageTitle}>الإعدادات</Text><View style={s.card}><Text style={s.cardTitle}>Backend</Text><TextInput value={apiBase} onChangeText={setApiBase} autoCapitalize="none" style={s.input}/><Text style={s.muted}>يمكنك تغيير عنوان الخادم دون إعادة بناء التطبيق.</Text></View><View style={s.card}><Text style={s.cardTitle}>GitHub</Text><Text style={s.cardText}>{projects.find(p=>p.id===projectId)?.repositoryUrl||'غير مرتبط'}</Text><Pressable onPress={()=>void connectGithub()} style={s.secondary}><Text style={s.secondaryText}>ربط حساب GitHub عبر OAuth</Text></Pressable><Pressable onPress={()=>void refreshGithubStatus()} style={s.secondary}><Text style={s.secondaryText}>فحص حالة GitHub</Text></Pressable><Pressable onPress={()=>void commit()} style={s.secondary}><Text style={s.secondaryText}>حفظ التغييرات إلى GitHub</Text></Pressable><Text style={s.status}>{commitStatus}</Text></View><View style={s.card}><Text style={s.cardTitle}>الأمان</Text><Text style={s.cardText}>العمليات الحساسة مثل Commit تحتاج إلى موافقة صريحة. التنفيذ المباشر خارج Sandbox غير مفعّل.</Text></View></ScrollView>}
   </View>
   {approval&&<View style={s.approval}><Text style={s.approvalText}>{approval.reason}</Text><Pressable onPress={()=>void approve()} style={s.primary}><Text style={s.primaryText}>موافقة وتنفيذ</Text></Pressable></View>}
   <View style={s.composer}><TextInput value={message} onChangeText={setMessage} placeholder="اكتب أمرًا جديدًا..." placeholderTextColor="#718078" style={s.message}/><Pressable onPress={()=>void send()} disabled={!message.trim()||sending} style={s.send}><Text style={s.sendText}>↑</Text></Pressable></View>
  </>}
 </KeyboardAvoidingView></SafeAreaView>
}
const s=StyleSheet.create({auth:{flexGrow:1,justifyContent:'center',padding:24},error:{color:'#FF8B8B',textAlign:'center',marginBottom:12},link:{color:'#70D6A1',textAlign:'center',padding:12},
 safe:{flex:1,backgroundColor:'#07110D'},fill:{flex:1},top:{padding:16,borderBottomWidth:1,borderBottomColor:'#183027',flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},brand:{color:'#fff',fontSize:24,fontWeight:'900',textAlign:'right'},subtitle:{color:'#7F978D',fontSize:11,marginTop:3,textAlign:'right'},statusDot:{width:10,height:10,borderRadius:5,backgroundColor:'#4ADE80'},start:{padding:18,paddingBottom:50},hero:{color:'#fff',fontSize:30,fontWeight:'900',textAlign:'right',marginTop:25},heroSub:{color:'#8DA097',fontSize:14,lineHeight:22,textAlign:'right',marginTop:8,marginBottom:20},pageTitle:{color:'#fff',fontSize:22,fontWeight:'900',textAlign:'right',marginBottom:6},pageSub:{color:'#8DA097',textAlign:'right',lineHeight:21,marginBottom:16},projectBar:{padding:10,borderBottomWidth:1,borderBottomColor:'#183027',flexDirection:'row-reverse',justifyContent:'space-between'},projectTitle:{color:'#fff',fontWeight:'800'},change:{color:'#70D6A1',fontWeight:'700'},nav:{flexDirection:'row-reverse',borderBottomWidth:1,borderBottomColor:'#183027',overflow:'hidden'},navItem:{paddingHorizontal:10,paddingVertical:11},navActive:{borderBottomWidth:2,borderBottomColor:'#70D6A1'},navText:{color:'#718078',fontSize:11},navTextActive:{color:'#fff'},content:{flex:1},pad:{padding:14,paddingBottom:90},input:{backgroundColor:'#101B16',borderWidth:1,borderColor:'#254137',borderRadius:12,color:'#fff',padding:13,marginBottom:9,textAlign:'right'},command:{minHeight:115,backgroundColor:'#0F1A15',borderWidth:1,borderColor:'#37604D',borderRadius:16,color:'#fff',padding:15,textAlign:'right',textAlignVertical:'top',marginBottom:10},primary:{backgroundColor:'#EAFBF1',borderRadius:13,padding:14,alignItems:'center',marginBottom:10},primarySmall:{backgroundColor:'#EAFBF1',borderRadius:11,padding:11,alignItems:'center',margin:5},primaryText:{color:'#07110D',fontWeight:'900'},secondary:{borderWidth:1,borderColor:'#315044',borderRadius:12,padding:12,alignItems:'center',marginBottom:10},secondaryText:{color:'#DDEBE4',fontWeight:'800'},quick:{flexDirection:'row-reverse',flexWrap:'wrap',gap:7,marginBottom:14},chip:{borderWidth:1,borderColor:'#315044',backgroundColor:'#0C1712',borderRadius:18,paddingHorizontal:12,paddingVertical:9},chipText:{color:'#CFE0D8',fontSize:11},section:{color:'#9EB2A8',fontWeight:'800',textAlign:'right',marginVertical:8},project:{backgroundColor:'#0E1914',borderWidth:1,borderColor:'#20372D',borderRadius:12,padding:13,marginBottom:7},projectName:{color:'#fff',fontWeight:'800',textAlign:'right'},projectRepo:{color:'#718078',fontSize:10,textAlign:'right',marginTop:3},card:{backgroundColor:'#0E1914',borderWidth:1,borderColor:'#20372D',borderRadius:14,padding:14,marginVertical:7},cardTitle:{color:'#fff',fontWeight:'900',textAlign:'right',marginBottom:8},cardText:{color:'#D0DDD7',textAlign:'right',lineHeight:21},muted:{color:'#718078',fontSize:11,marginTop:5},status:{color:'#78A08E',fontSize:11,textAlign:'center',marginVertical:5},row:{flexDirection:'row-reverse',gap:7},flex:{flex:1},fileHeader:{padding:12,flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},file:{padding:13,borderBottomWidth:1,borderBottomColor:'#183027'},fileText:{color:'#D8E4DF',fontSize:12,textAlign:'left'},editorBox:{height:270,padding:10,borderTopWidth:1,borderTopColor:'#254137'},editor:{flex:1,backgroundColor:'#0A120E',color:'#E8F0EC',borderRadius:10,padding:10,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',fontSize:11},terminal:{backgroundColor:'#030604',borderWidth:1,borderColor:'#254137',borderRadius:12,color:'#B8E6C9',padding:14,minHeight:260,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',marginTop:10},step:{flexDirection:'row-reverse',alignItems:'center',backgroundColor:'#0E1914',borderWidth:1,borderColor:'#20372D',borderRadius:12,padding:12,marginVertical:5},stepNum:{width:28,height:28,borderRadius:14,backgroundColor:'#EAFBF1',color:'#07110D',textAlign:'center',paddingTop:5,fontWeight:'900',marginLeft:10},stepTitle:{color:'#E8F0EC',textAlign:'right',fontWeight:'800'},empty:{color:'#718078',textAlign:'center',padding:30},log:{backgroundColor:'#0E1914',borderWidth:1,borderColor:'#20372D',borderRadius:12,padding:12,marginBottom:8},userLog:{borderColor:'#47745C'},logText:{color:'#DCE8E2',lineHeight:20,textAlign:'right',marginTop:5},preview:{flex:1,alignItems:'center',justifyContent:'center',padding:20,backgroundColor:'#0A120E'},previewText:{color:'#9DB0A7',textAlign:'center',marginBottom:15},approval:{padding:10,borderTopWidth:1,borderColor:'#705B22',backgroundColor:'#19170E'},approvalText:{color:'#FFECC0',textAlign:'right',marginBottom:8},composer:{position:'absolute',bottom:0,left:0,right:0,padding:8,borderTopWidth:1,borderTopColor:'#183027',backgroundColor:'#08130E',flexDirection:'row-reverse',gap:7},message:{flex:1,minHeight:46,maxHeight:90,backgroundColor:'#101B16',borderWidth:1,borderColor:'#315044',borderRadius:14,color:'#fff',padding:11,textAlign:'right'},send:{width:46,height:46,borderRadius:13,backgroundColor:'#EAFBF1',alignItems:'center',justifyContent:'center'},sendText:{color:'#07110D',fontSize:23,fontWeight:'900'}
});
