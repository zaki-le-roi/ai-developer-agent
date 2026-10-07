import React,{useEffect,useMemo,useState} from 'react';
import {Alert,KeyboardAvoidingView,Linking,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL='https://bmz-ai-backend.onrender.com';
const CONFIGURED_API_URL=(process.env.EXPO_PUBLIC_API_URL?.trim()||DEFAULT_API_URL).replace(/\/$/,'');
const TIMEOUT=20000;
type Mode='chat'|'site'|'social'|'control';
type Msg={id:number;role:'user'|'agent';text:string};
type Project={id:string;name:string;repositoryUrl?:string};
type Integration={id:string;name:string;capabilities?:string[]};
type Permission={id:string;permission:string;scope?:string};

function normalizeUrl(value:string){
 const v=value.trim().replace(/\/$/,''); if(!v)return '';
 let u:URL; try{u=new URL(v);}catch{throw new Error('العنوان غير صالح.');}
 if(u.protocol!=='https:')throw new Error('استخدم HTTPS فقط.');
 return v;
}

export default function HomeScreen(){
 const {width}=useWindowDimensions();
 const wide=width>=760;
 const [boot,setBoot]=useState(true),[token,setToken]=useState<string|null>(null),[api,setApi]=useState(CONFIGURED_API_URL),[error,setError]=useState('');
 const [projects,setProjects]=useState<Project[]>([]),[projectId,setProjectId]=useState<string|null>(null);
 const [mode,setMode]=useState<Mode>('chat'),[message,setMessage]=useState(''),[sending,setSending]=useState(false),[messages,setMessages]=useState<Msg[]>([]);
 const [previewUrl,setPreviewUrl]=useState(''),[previewBusy,setPreviewBusy]=useState(false);
 const [siteUrl,setSiteUrl]=useState(''),[siteSession,setSiteSession]=useState(''),[siteText,setSiteText]=useState(''),[siteBusy,setSiteBusy]=useState(false);
 const [integrations,setIntegrations]=useState<Integration[]>([]),[permissions,setPermissions]=useState<Permission[]>([]);
 const [fbToken,setFbToken]=useState(''),[waToken,setWaToken]=useState(''),[waPhone,setWaPhone]=useState(''),[verifyToken,setVerifyToken]=useState('');
 const [recipient,setRecipient]=useState(''),[socialText,setSocialText]=useState(''),[socialBusy,setSocialBusy]=useState(false);
 const [logs,setLogs]=useState<string[]>([]),[approval,setApproval]=useState<any>(null);

 const base=projectId?api+'/api/projects/'+projectId:'';
 const currentProject=useMemo(()=>projects.find(p=>p.id===projectId),[projects,projectId]);

 async function apiFetch(url:string,init?:RequestInit){
  const doReq=async(t:string|null)=>{
   const h=new Headers(init?.headers); if(t)h.set('Authorization','Bearer '+t);
   const c=new AbortController();const timer=setTimeout(()=>c.abort(),TIMEOUT);
   try{return await fetch(url,{...init,headers:h,signal:c.signal});}
   catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error('انتهت مهلة الاتصال بالخادم.');throw new Error('تعذر الاتصال بالخادم.');}
   finally{clearTimeout(timer);}
  };
  let r=await doReq(token);
  if(r.status===401&&!url.includes('/api/auth/device')){
   const id=(await SecureStore.getItemAsync('bmz_device_id'))||('android-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
   await SecureStore.setItemAsync('bmz_device_id',id);
   const a=await fetch(api+'/api/auth/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:id})});
   const d=await a.json().catch(()=>({})); if(!a.ok||!d.token)throw new Error(d.error||'تعذر تفعيل الجهاز.');
   await SecureStore.setItemAsync('bmz_auth_token',d.token);setToken(d.token);r=await doReq(d.token);
  }
  return r;
 }
 async function json(r:Response){const raw=await r.text();try{return raw?JSON.parse(raw):{};}catch{return {error:raw};}}

 useEffect(()=>{void(async()=>{try{
  const [t,s]=await Promise.all([SecureStore.getItemAsync('bmz_auth_token'),SecureStore.getItemAsync('bmz_api_base')]);
  const endpoint=normalizeUrl(s||CONFIGURED_API_URL);setApi(endpoint);
  if(t)setToken(t);else{const id=(await SecureStore.getItemAsync('bmz_device_id'))||('android-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));await SecureStore.setItemAsync('bmz_device_id',id);const r=await fetch(endpoint+'/api/auth/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:id})});const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر تفعيل الهاتف.');await SecureStore.setItemAsync('bmz_auth_token',d.token);setToken(d.token);}
 }catch(e){setError(e instanceof Error?e.message:'تعذر الاتصال.');}finally{setBoot(false);}})()},[]);
 useEffect(()=>{if(token)void loadAll()},[token]);
 async function loadAll(){try{
  const p=await apiFetch(api+'/api/projects');const pd=await json(p);if(p.ok){setProjects(pd.projects||[]);if(!projectId&&pd.projects?.[0])setProjectId(pd.projects[0].id);}
  const i=await apiFetch(api+'/api/integrations');const id=await json(i);if(i.ok)setIntegrations(id.integrations||[]);
  const q=await apiFetch(api+'/api/permissions');const qd=await json(q);if(q.ok)setPermissions(qd.permissions||[]);
 }catch{}}
 async function send(){
  const text=message.trim();if(!text||sending)return;setSending(true);setMessages(x=>[...x,{id:Date.now(),role:'user',text}]);setMessage('');
  try{
   const r=await apiFetch(api+'/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,projectId})});
   const d=await json(r);
   if(d.approval){setApproval(d.approval);setMessages(x=>[...x,{id:Date.now()+1,role:'agent',text:'أحتاج موافقتك قبل تنفيذ العملية الحساسة: '+d.approval.reason}]);return;}
   if(!r.ok||!d.success)throw new Error(d.error||'فشل التنفيذ.');
   const obs=(d.execution?.observations||[]).map((o:any)=>(o.ok?'✓ ':'✗ ')+(o.summary||'')).join('\n');
   setMessages(x=>[...x,{id:Date.now()+1,role:'agent',text:d.assistantMessage||d.execution?.message||'اكتملت المهمة.'+(obs?'\n'+obs:'')}]);
   setLogs(x=>[new Date().toLocaleTimeString()+' — '+(d.assistantMessage||d.execution?.message||'اكتملت المهمة.'),...x].slice(0,30));
  }catch(e){setMessages(x=>[...x,{id:Date.now()+1,role:'agent',text:'✗ '+(e instanceof Error?e.message:'حدث خطأ')}]);}
  finally{setSending(false);}
 }
 async function startPreview(){
  if(!projectId)return Alert.alert('المشروع','اختر مشروعًا أولًا.');
  setPreviewBusy(true);try{const r=await apiFetch(base+'/preview/start',{method:'POST'});const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر تشغيل المعاينة.');const u=api+d.preview.urlPath+'?token='+encodeURIComponent(d.preview.token);setPreviewUrl(u);}catch(e){Alert.alert('المعاينة',e instanceof Error?e.message:'تعذر تشغيل المعاينة.')}finally{setPreviewBusy(false);}
 }
 async function openSite(){
  const u=normalizeUrl(siteUrl);setSiteBusy(true);try{
   const r=await apiFetch(api+'/api/browser/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:siteSession||'mobile-'+Date.now(),url:u,allowedDomains:[new URL(u).hostname]})});
   const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر فتح الموقع.');const sid=d.result?.sessionId||d.result?.id||siteSession||'mobile';setSiteSession(sid);setSiteText(JSON.stringify(d.result,null,2));setLogs(x=>['🌐 فتح الموقع: '+u,...x].slice(0,30));
  }catch(e){Alert.alert('Browser Agent',e instanceof Error?e.message:'فشل فتح الموقع.')}finally{setSiteBusy(false);}
 }
 async function readSite(){if(!siteSession)return;setSiteBusy(true);try{const r=await apiFetch(api+'/api/browser/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:siteSession})});const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر قراءة الصفحة.');setSiteText(JSON.stringify(d.result,null,2));}catch(e){Alert.alert('Browser Agent',e instanceof Error?e.message:'فشل القراءة.')}finally{setSiteBusy(false);}}
 async function grant(permission:string){try{const r=await apiFetch(api+'/api/permissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({permission,projectId})});const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر منح الصلاحية.');setPermissions(x=>[...x,d.permission]);}catch(e){Alert.alert('الصلاحيات',e instanceof Error?e.message:'تعذر منح الصلاحية.')}}
 async function connectMeta(){try{const r=await apiFetch(api+'/api/integrations/meta/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageAccessToken:fbToken,whatsappAccessToken:waToken,whatsappPhoneNumberId:waPhone,verifyToken})});const d=await json(r);if(!r.ok)throw new Error(d.error||'تعذر ربط Meta.');setLogs(x=>['✓ تم حفظ إعدادات Facebook/WhatsApp. Webhook: '+(d.webhookToken||''),...x]);Alert.alert('تم الربط','تم حفظ بيانات Meta في الخادم. يلزم إعداد Webhook في Meta لاختبار الرسائل الواردة.');}catch(e){Alert.alert('Meta',e instanceof Error?e.message:'تعذر الربط.')}}
 async function sendSocial(channel:'facebook'|'whatsapp'){if(!recipient.trim()||!socialText.trim())return;setSocialBusy(true);try{const path=channel==='facebook'?'/api/integrations/meta/facebook/send':'/api/integrations/meta/whatsapp/send';const body=channel==='facebook'?{recipientId:recipient,text:socialText}:{to:recipient,text:socialText};const r=await apiFetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await json(r);if(!r.ok)throw new Error(d.error||'فشل إرسال الرسالة.');setLogs(x=>['✓ أُرسلت رسالة '+channel,...x]);}catch(e){Alert.alert(channel,e instanceof Error?e.message:'فشل الإرسال.')}finally{setSocialBusy(false);}}
 async function approve(){if(!approval)return;const r=await apiFetch(api+'/api/approvals/'+approval.id+'/approve',{method:'POST'});if(r.ok){setApproval(null);Alert.alert('تمت الموافقة','أعد إرسال المهمة لتنفيذها.');}}

 const nav:[Mode,string,string][]=[['chat','الموظف','✦'],['site','المواقع','⌘'],['social','التواصل','◉'],['control','التحكم','⚙']];
 const permissionNames:[string,string][]=[['BROWSER_AUTOMATION','Browser Agent'],['READ_PROJECT','قراءة المشروع'],['WRITE_PROJECT','تعديل الملفات'],['RUN_COMMAND','تشغيل الأوامر'],['NETWORK_ACCESS','الوصول للشبكة'],['SEND_MESSAGE','إرسال رسائل العملاء'],['GITHUB_WRITE','كتابة GitHub'],['SCHEDULE_WORKFLOW','التشغيل المجدول']];

 if(boot)return <SafeAreaView style={s.root}><View style={s.center}><Text style={s.logo}>BMZ</Text><Text style={s.title}>جاري تشغيل الموظف الذكي</Text><Text style={s.muted}>تهيئة مساحة العمل والوكيل...</Text></View></SafeAreaView>;
 if(!token)return <SafeAreaView style={s.root}><View style={s.center}><Text style={s.logo}>BMZ</Text><Text style={s.title}>تعذر الاتصال</Text><Text style={s.muted}>{error}</Text><TextInput value={api} onChangeText={setApi} style={s.input} autoCapitalize="none"/><Pressable style={s.button} onPress={()=>{void SecureStore.setItemAsync('bmz_api_base',api);setToken(null);setBoot(true);}}><Text style={s.buttonText}>إعادة المحاولة</Text></Pressable></View></SafeAreaView>;

 return <SafeAreaView style={s.root}><StatusBar barStyle="light-content"/><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.header}><View><Text style={s.logoSmall}>BMZ AI</Text><Text style={s.sub}>الموظف الافتراضي • {currentProject?.name||'مساحة العمل'}</Text></View><View style={s.online}><View style={s.dot}/><Text style={s.onlineText}>متصل</Text></View></View>
  <View style={s.body}>
   <View style={s.rail}>{nav.map(([id,label,icon])=><Pressable key={id} onPress={()=>setMode(id)} style={[s.railItem,mode===id&&s.railActive]}><Text style={s.railIcon}>{icon}</Text><Text style={s.railText}>{label}</Text></Pressable>)}</View>
   <View style={s.workspace}>
    <View style={s.workspaceTop}><View><Text style={s.workspaceTitle}>{mode==='chat'?'الموظف الذكي':mode==='site'?'إدارة المواقع':mode==='social'?'WhatsApp و Facebook':'صلاحيات وتشغيل الوكيل'}</Text><Text style={s.sub}>نفّذ المهام من نفس الشاشة، وراقب ما يفعله الوكيل لحظة بلحظة.</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.projectRow}>{projects.map(p=><Pressable key={p.id} onPress={()=>setProjectId(p.id)} style={[s.projectPill,p.id===projectId&&s.projectOn]}><Text style={s.projectText}>{p.name}</Text></Pressable>)}</ScrollView></View>
    <View style={[s.split,!wide&&s.splitMobile]}>
     <View style={s.left}>
      {mode==='chat'&&<View style={s.chatWrap}><ScrollView contentContainerStyle={s.chatScroll}>{messages.length===0&&<View style={s.welcome}><Text style={s.welcomeTitle}>ماذا تريد أن يدير BMZ AI؟</Text><Text style={s.welcomeSub}>الموقع، الطلبات، العملاء، GitHub، المهام المتكررة، والعمليات التي تمنحه صلاحيتها.</Text><View style={s.suggestions}>{['حلّل موقعي وأخبرني بالمشاكل','افتح لوحة موقعي وافحص الطلبات','راجع المشروع وأصلح الأخطاء','أنشئ نظام متابعة لرسائل العملاء'].map(x=><Pressable key={x} onPress={()=>setMessage(x)} style={s.suggestion}><Text style={s.suggestionText}>{x}</Text></Pressable>)}</View></View>}{messages.map(m=><View key={m.id} style={[s.bubble,m.role==='user'?s.userBubble:s.agentBubble]}><Text style={s.bubbleRole}>{m.role==='user'?'أنت':'BMZ AI'}</Text><Text style={s.bubbleText}>{m.text}</Text></View>)}</ScrollView><View style={s.composer}><TextInput value={message} onChangeText={setMessage} multiline placeholder="اطلب من BMZ AI تنفيذ مهمة..." placeholderTextColor="#64748B" style={s.message}/><Pressable onPress={()=>void send()} disabled={sending} style={s.send}><Text style={s.sendText}>{sending?'…':'↑'}</Text></Pressable></View></View>}
      {mode==='site'&&<ScrollView contentContainerStyle={s.panel}><Text style={s.panelTitle}>Browser Agent</Text><Text style={s.panelSub}>اربط موقعك أو لوحة الإدارة، ثم دع الوكيل يفتح الصفحات ويقرأها وينفذ خطوات مسموحة.</Text><TextInput value={siteUrl} onChangeText={setSiteUrl} placeholder="https://example.com أو رابط لوحة الإدارة" placeholderTextColor="#64748B" style={s.input}/><View style={s.row}><Pressable style={s.buttonFlex} onPress={()=>void openSite()} disabled={siteBusy}><Text style={s.buttonText}>{siteBusy?'جاري الفتح…':'فتح الموقع'}</Text></Pressable><Pressable style={s.outlineFlex} onPress={()=>void readSite()} disabled={!siteSession}><Text style={s.outlineText}>قراءة الصفحة</Text></Pressable></View><View style={s.card}><Text style={s.cardTitle}>جلسة المتصفح</Text><Text style={s.muted}>{siteSession||'لم تبدأ بعد'}</Text><Text style={s.code}>{siteText||'ستظهر هنا الصفحة/البيانات التي قرأها الوكيل.'}</Text></View><Text style={s.panelTitle}>ما يمكن أن يبنيه الوكيل بعد منح الصلاحية</Text>{['فحص المنتجات والأسعار','قراءة الطلبات والحجوزات','تعبئة نماذج لوحة الإدارة','تنفيذ خطوات متتابعة مع سجل Trace'].map(x=><View key={x} style={s.feature}><Text style={s.featureIcon}>✓</Text><Text style={s.featureText}>{x}</Text></View>)}<Text style={s.panelTitle}>عمليات الأعمال</Text><View style={s.suggestions}>{['إدارة الطلبات','إدارة الحجوزات','متابعة العملاء','مراجعة المبيعات'].map(x=><Pressable key={x} onPress={()=>{setMessage(x+' — افتح الموقع المرتبط، افحص البيانات، ثم نفّذ الخطوات المسموح بها وأعطني تقريرًا واضحًا قبل أي إجراء حساس.');setMode('chat')}} style={s.suggestion}><Text style={s.suggestionText}>تشغيل: {x}</Text></Pressable>)}</View></ScrollView>}
      {mode==='social'&&<ScrollView contentContainerStyle={s.panel}><Text style={s.panelTitle}>مركز العملاء</Text><Text style={s.panelSub}>ربط Facebook Pages وWhatsApp Cloud API مع ذاكرة BMZ AI، ثم إرسال الرسائل من الخادم.</Text><TextInput value={fbToken} onChangeText={setFbToken} placeholder="Facebook Page Access Token" placeholderTextColor="#64748B" style={s.input} secureTextEntry/><TextInput value={waToken} onChangeText={setWaToken} placeholder="WhatsApp Access Token" placeholderTextColor="#64748B" style={s.input} secureTextEntry/><TextInput value={waPhone} onChangeText={setWaPhone} placeholder="WhatsApp Phone Number ID" placeholderTextColor="#64748B" style={s.input}/><TextInput value={verifyToken} onChangeText={setVerifyToken} placeholder="Webhook Verify Token" placeholderTextColor="#64748B" style={s.input} secureTextEntry/><Pressable style={s.button} onPress={()=>void connectMeta()}><Text style={s.buttonText}>حفظ وربط Facebook + WhatsApp</Text></Pressable><View style={s.divider}/><Text style={s.cardTitle}>إرسال رسالة</Text><TextInput value={recipient} onChangeText={setRecipient} placeholder="معرّف المستلم / رقم WhatsApp" placeholderTextColor="#64748B" style={s.input}/><TextInput value={socialText} onChangeText={setSocialText} placeholder="نص الرسالة" placeholderTextColor="#64748B" style={[s.input,s.textArea]}/><View style={s.row}><Pressable style={s.buttonFlex} onPress={()=>void sendSocial('whatsapp')} disabled={socialBusy}><Text style={s.buttonText}>إرسال WhatsApp</Text></Pressable><Pressable style={s.outlineFlex} onPress={()=>void sendSocial('facebook')} disabled={socialBusy}><Text style={s.outlineText}>إرسال Facebook</Text></Pressable></View><View style={s.card}><Text style={s.cardTitle}>التكاملات المتاحة</Text>{integrations.map(i=><Text key={i.id} style={s.featureText}>• {i.name} — {(i.capabilities||[]).join(', ')}</Text>)}</View></ScrollView>}
      {mode==='control'&&<ScrollView contentContainerStyle={s.panel}><Text style={s.panelTitle}>مركز التحكم والصلاحيات</Text><Text style={s.panelSub}>هذه صلاحيات فعلية للـBackend والـBrowser Agent. لا يتم منح العمليات الحساسة تلقائيًا.</Text>{permissionNames.map(([key,label])=>{const active=permissions.some(p=>p.permission===key);return <Pressable key={key} onPress={()=>!active&&void grant(key)} style={[s.permission,active&&s.permissionOn]}><View style={[s.permDot,active&&s.permDotOn]}/><View style={s.flex}><Text style={s.permissionTitle}>{label}</Text><Text style={s.muted}>{active?'مفعّلة':'اضغط لتفعيلها'}</Text></View><Text style={s.permissionState}>{active?'ON':'OFF'}</Text></Pressable>})}<View style={s.card}><Text style={s.cardTitle}>التحكم في الهاتف</Text><Text style={s.cardText}>BMZ AI لا يحصل تلقائيًا على تحكم نظام Android الكامل. التحكم الآمن هنا يتم عبر صلاحيات التطبيق، المتصفح، الشبكة، والعمليات المصرّح بها. التحكم الكامل بتطبيقات أخرى يحتاج خدمة Android Accessibility/Device APIs مخصصة وسيتم بناؤها كطبقة منفصلة، وليس زرًا وهميًا.</Text></View><Text style={s.panelTitle}>آخر العمليات</Text>{logs.map((x,i)=><Text key={i} style={s.log}>{x}</Text>)}</ScrollView>}
     </View>
     <View style={s.right}>
      <View style={s.previewHead}><View><Text style={s.previewTitle}>Live Workspace</Text><Text style={s.muted}>{previewUrl?'المعاينة تعمل داخل التطبيق':'المعاينة الحية للمشروع'}</Text></View><Pressable onPress={()=>void startPreview()} style={s.previewButton}><Text style={s.previewButtonText}>{previewBusy?'…':'تشغيل'}</Text></Pressable></View>
      {previewUrl?<WebView source={{uri:previewUrl}} style={s.web} originWhitelist={['*']} javaScriptEnabled domStorageEnabled/>:<View style={s.previewEmpty}><Text style={s.previewIcon}>◈</Text><Text style={s.previewEmptyTitle}>المعاينة الحية</Text><Text style={s.previewEmptyText}>شغّل Preview ليظهر الموقع هنا. ستبقى الدردشة وأدوات الوكيل بجانبه.</Text><Pressable onPress={()=>void startPreview()} style={s.button}><Text style={s.buttonText}>تشغيل Live Preview</Text></Pressable></View>}
     </View>
    </View>
   </View>
  </View>
  {approval&&<View style={s.approval}><Text style={s.approvalText}>{approval.reason}</Text><Pressable style={s.button} onPress={()=>void approve()}><Text style={s.buttonText}>موافقة</Text></Pressable></View>}
 </KeyboardAvoidingView></SafeAreaView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:'#060B12'},flex:{flex:1},center:{flex:1,justifyContent:'center',alignItems:'center',padding:25,backgroundColor:'#060B12'},logo:{fontSize:42,fontWeight:'900',color:'#F8FAFC',letterSpacing:4},logoSmall:{fontSize:21,fontWeight:'900',color:'#F8FAFC'},title:{fontSize:26,fontWeight:'900',color:'#F8FAFC',marginTop:15,textAlign:'center'},sub:{color:'#718096',fontSize:11,marginTop:3},muted:{color:'#718096',fontSize:11,lineHeight:18},header:{height:66,borderBottomWidth:1,borderBottomColor:'#182333',backgroundColor:'#080F18',paddingHorizontal:16,flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},online:{flexDirection:'row-reverse',alignItems:'center',gap:6},dot:{width:8,height:8,borderRadius:4,backgroundColor:'#34D399'},onlineText:{color:'#8BA39A',fontSize:11},body:{flex:1,flexDirection:'row-reverse'},rail:{width:76,borderLeftWidth:1,borderLeftColor:'#182333',backgroundColor:'#080F18',paddingTop:10,alignItems:'center'},railItem:{width:66,paddingVertical:11,borderRadius:14,alignItems:'center',marginBottom:5},railActive:{backgroundColor:'#122333'},railIcon:{color:'#A9F3E8',fontSize:18},railText:{color:'#728196',fontSize:10,marginTop:4,fontWeight:'700'},workspace:{flex:1,minWidth:0},workspaceTop:{padding:14,borderBottomWidth:1,borderBottomColor:'#182333',backgroundColor:'#070E17',flexDirection:'row-reverse',justifyContent:'space-between',gap:12},workspaceTitle:{color:'#F8FAFC',fontSize:19,fontWeight:'900',textAlign:'right'},projectRow:{alignItems:'center',gap:7},projectPill:{borderWidth:1,borderColor:'#203247',paddingHorizontal:11,paddingVertical:8,borderRadius:18,backgroundColor:'#0B1420'},projectOn:{borderColor:'#55DCCB',backgroundColor:'#0D2628'},projectText:{color:'#D4DFEA',fontSize:10,fontWeight:'800'},split:{flex:1,flexDirection:'row-reverse'},splitMobile:{flexDirection:'column'},left:{flex:1,minWidth:0,borderLeftWidth:1,borderLeftColor:'#182333'},right:{flex:1,minWidth:0,backgroundColor:'#02060B'},chatWrap:{flex:1},chatScroll:{padding:18,paddingBottom:95},welcome:{paddingTop:20},welcomeTitle:{color:'#F8FAFC',fontSize:26,fontWeight:'900',textAlign:'right',lineHeight:34},welcomeSub:{color:'#8290A3',fontSize:13,lineHeight:21,textAlign:'right',marginTop:8,marginBottom:18},suggestions:{gap:8},suggestion:{borderWidth:1,borderColor:'#1D3043',backgroundColor:'#0A141F',borderRadius:14,padding:12},suggestionText:{color:'#BFD0DE',textAlign:'right',fontSize:12},bubble:{maxWidth:'92%',padding:13,borderRadius:16,marginBottom:10},userBubble:{alignSelf:'flex-start',backgroundColor:'#123038',borderWidth:1,borderColor:'#205C62'},agentBubble:{alignSelf:'flex-end',backgroundColor:'#0C1622',borderWidth:1,borderColor:'#1B2D40'},bubbleRole:{color:'#6E8498',fontSize:10,fontWeight:'800',marginBottom:5},bubbleText:{color:'#E5EDF5',fontSize:13,lineHeight:21,textAlign:'right'},composer:{position:'absolute',left:12,right:12,bottom:12,backgroundColor:'#0A121C',borderWidth:1,borderColor:'#203247',borderRadius:18,padding:7,flexDirection:'row-reverse',gap:7},message:{flex:1,minHeight:46,maxHeight:90,color:'#F8FAFC',paddingHorizontal:11,textAlign:'right'},send:{width:46,height:46,borderRadius:13,backgroundColor:'#D9FFF7',justifyContent:'center',alignItems:'center'},sendText:{fontSize:21,fontWeight:'900',color:'#071016'},panel:{padding:16,paddingBottom:40},panelTitle:{color:'#F8FAFC',fontSize:21,fontWeight:'900',textAlign:'right',marginBottom:6},panelSub:{color:'#8392A4',fontSize:12,lineHeight:20,textAlign:'right',marginBottom:16},input:{width:'100%',backgroundColor:'#0B1521',borderWidth:1,borderColor:'#21354A',borderRadius:13,padding:13,color:'#F8FAFC',textAlign:'right',marginBottom:9},textArea:{minHeight:95,textAlignVertical:'top'},row:{flexDirection:'row-reverse',gap:8},button:{backgroundColor:'#D9FFF7',borderRadius:13,padding:13,alignItems:'center',marginVertical:5},buttonText:{color:'#061015',fontWeight:'900',fontSize:12},buttonFlex:{flex:1,backgroundColor:'#D9FFF7',borderRadius:13,padding:13,alignItems:'center'},outlineFlex:{flex:1,borderWidth:1,borderColor:'#294258',borderRadius:13,padding:13,alignItems:'center'},outlineText:{color:'#D8E5F0',fontWeight:'800',fontSize:12},card:{backgroundColor:'#0A141F',borderWidth:1,borderColor:'#1B2D40',borderRadius:15,padding:14,marginTop:13},cardTitle:{color:'#F4F8FC',fontSize:14,fontWeight:'900',textAlign:'right',marginBottom:6},cardText:{color:'#B7C6D4',fontSize:12,lineHeight:21,textAlign:'right'},code:{color:'#9FEDE2',fontSize:10,lineHeight:17,marginTop:10,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',textAlign:'left'},feature:{flexDirection:'row-reverse',alignItems:'center',padding:11,borderBottomWidth:1,borderBottomColor:'#152536'},featureIcon:{color:'#6BE7D7',fontWeight:'900',marginLeft:8},featureText:{color:'#B9C8D6',fontSize:12,textAlign:'right'},divider:{height:1,backgroundColor:'#182A3B',marginVertical:18},permission:{flexDirection:'row-reverse',alignItems:'center',borderWidth:1,borderColor:'#1B2D40',backgroundColor:'#0A141F',borderRadius:14,padding:12,marginBottom:8},permissionOn:{borderColor:'#245C59',backgroundColor:'#0C1F20'},permDot:{width:10,height:10,borderRadius:5,backgroundColor:'#354456',marginLeft:10},permDotOn:{backgroundColor:'#52DEC9'},permissionTitle:{color:'#E7EEF5',fontWeight:'800',textAlign:'right'},permissionState:{color:'#6F8295',fontSize:10,fontWeight:'900'},previewHead:{padding:13,borderBottomWidth:1,borderBottomColor:'#182333',flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},previewTitle:{color:'#F8FAFC',fontWeight:'900',fontSize:15},previewButton:{borderWidth:1,borderColor:'#2A4A5C',borderRadius:10,paddingHorizontal:12,paddingVertical:8},previewButtonText:{color:'#9FEDE2',fontWeight:'900',fontSize:11},web:{flex:1,backgroundColor:'#fff'},previewEmpty:{flex:1,justifyContent:'center',alignItems:'center',padding:30},previewIcon:{color:'#65E2D2',fontSize:35},previewEmptyTitle:{color:'#F8FAFC',fontSize:20,fontWeight:'900',marginTop:10},previewEmptyText:{color:'#718096',textAlign:'center',lineHeight:21,marginVertical:10},log:{color:'#7F93A7',fontSize:10,paddingVertical:5,textAlign:'right'},approval:{position:'absolute',left:10,right:10,bottom:10,backgroundColor:'#211A0C',borderWidth:1,borderColor:'#735C25',borderRadius:16,padding:13,zIndex:10},approvalText:{color:'#FFE9B0',textAlign:'right',lineHeight:20,marginBottom:5}
});
