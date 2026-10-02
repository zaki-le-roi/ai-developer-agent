import React,{useEffect,useMemo,useState} from 'react';
import {KeyboardAvoidingView,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';

const API_URL=process.env.EXPO_PUBLIC_API_URL??'http://192.168.1.119:4000';
type FileItem={path:string};
type Msg={id:number,role:'user'|'agent',text:string};
type Approval={id:string,reason:string};
type Tab='files'|'code'|'preview'|'agent';

export default function HomeScreen(){
 const [projectId,setProjectId]=useState<string|null>(null),[sessionId,setSessionId]=useState<string|null>(null);
 const [repo,setRepo]=useState(''),[message,setMessage]=useState(''),[sending,setSending]=useState(false);
 const [files,setFiles]=useState<string[]>([]),[selected,setSelected]=useState(''),[code,setCode]=useState('');
 const [tab,setTab]=useState<Tab>('agent'),[logs,setLogs]=useState<Msg[]>([]),[approval,setApproval]=useState<Approval|null>(null);
 const [previewKey,setPreviewKey]=useState(0),[commitStatus,setCommitStatus]=useState('');
 const {width}=useWindowDimensions(); const wide=width>=800;
 const base=projectId?API_URL+'/api/projects/'+projectId:'';
 async function ensureProject(){
  if(projectId)return projectId;
  const endpoint=repo.trim()?API_URL+'/api/projects/import-github':API_URL+'/api/projects';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'مشروع BMZ AI',...(repo.trim()?{repositoryUrl:repo.trim()}:{})})});
  const d=await r.json(); if(!r.ok||!d.project?.id)throw new Error(d.error||'تعذر إنشاء المشروع.');
  setProjectId(d.project.id); await refreshFiles(d.project.id); return d.project.id;
 }
 async function ensureSession(pid:string){if(sessionId)return sessionId;const r=await fetch(API_URL+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر إنشاء الجلسة.');setSessionId(d.session.id);return d.session.id;}
 async function refreshFiles(pid=projectId){if(!pid)return;const r=await fetch(API_URL+'/api/projects/'+pid+'/files');const d=await r.json();if(r.ok)setFiles(d.files||[]);}
 async function openFile(path:string){if(!projectId)return;const r=await fetch(API_URL+'/api/projects/'+projectId+'/file?path='+encodeURIComponent(path));const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر قراءة الملف.');setSelected(path);setCode(d.content||'');setTab('code');}
 async function saveFile(){if(!projectId||!selected)return;const r=await fetch(API_URL+'/api/projects/'+projectId+'/file',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:selected,content:code})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر حفظ الملف.');setCommitStatus('تم الحفظ داخل مساحة العمل.');setPreviewKey(x=>x+1);await refreshFiles();}
 async function send(textOverride?:string,approvalToken?:string){
  const text=(textOverride??message).trim();if(!text||sending)return;setSending(true);setLogs(x=>[...x,{id:Date.now(),role:'user',text}]);setMessage('');
  try{const pid=await ensureProject();const sid=await ensureSession(pid);const r=await fetch(API_URL+'/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,projectId:pid,sessionId:sid,...(approvalToken?{permissionLevel:'approval_required',approvalToken}: {})})});const d=await r.json();
   if(d.approval){setApproval(d.approval);setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:'مطلوب موافقة: '+d.approval.reason}]);return;}
   if(!r.ok||!d.success)throw new Error(d.error||d.execution?.message||'فشل التنفيذ.');
   const summary=[d.execution?.message||'اكتمل التنفيذ.',...(d.execution?.observations||[]).map((o:any)=>(o.ok?'✓ ':'✗ ')+o.summary)].join('\n');
   setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:summary}]);await refreshFiles(pid);setTab('agent');
  }catch(e){setLogs(x=>[...x,{id:Date.now()+1,role:'agent',text:e instanceof Error?e.message:'حدث خطأ.'}]);}
  finally{setSending(false);}
 }
 async function commit(){
  if(!projectId)return;setCommitStatus('جاري طلب الموافقة...');
  const r=await fetch(base+'/github/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'BMZ AI: تحديث المشروع'})});const d=await r.json();
  if(d.approval){setApproval(d.approval);setCommitStatus('الموافقة مطلوبة لإرسال التغييرات إلى GitHub.');return;}
  setCommitStatus(r.ok?'تم إنشاء Commit على GitHub: '+d.commit.commitSha:'خطأ: '+(d.error||'فشل Commit'));
 }
 async function approve(){if(!approval)return;const id=approval.id;const r=await fetch(API_URL+'/api/approvals/'+id+'/approve',{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تسجيل الموافقة.');setApproval(null);if(commitStatus.includes('GitHub')){const cr=await fetch(base+'/github/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'BMZ AI: تحديث المشروع',approvalToken:id})});const cd=await cr.json();setCommitStatus(cr.ok?'تم إرسال Commit إلى GitHub: '+cd.commit.commitSha:'خطأ: '+(cd.error||'فشل Commit'));}else{const last=logs.filter(x=>x.role==='user').at(-1)?.text;if(last)await send(last,id);}}
 const tabs:Tab[]=['files','code','preview','agent'];
 return <SafeAreaView style={s.safe}><StatusBar barStyle="light-content" backgroundColor="#080808"/><KeyboardAvoidingView style={s.fill} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={s.header}><View><Text style={s.brand}>BMZ AI</Text><Text style={s.sub}>بيئة تطوير فعلية — GitHub + Android + Gradle</Text></View><View style={s.dot}/></View>
  {!projectId&&<View style={s.repoBox}><TextInput value={repo} onChangeText={setRepo} placeholder="رابط GitHub اختياري" placeholderTextColor="#777" style={s.input}/></View>}
  <View style={s.tabs}>{tabs.map(t=><Pressable key={t} onPress={()=>setTab(t)} style={[s.tab,tab===t&&s.active]}><Text style={s.tabText}>{t==='files'?'الملفات':t==='code'?'الكود':t==='preview'?'المعاينة':'الوكيل'}</Text></Pressable>)}</View>
  <View style={s.body}>
   {wide ? <View style={s.ideSplit}>
    <ScrollView style={s.filePane}>{files.length?files.map(p=><Pressable key={p} onPress={()=>openFile(p)} style={s.file}><Text style={s.fileText}>{p}</Text></Pressable>):<Text style={s.empty}>لا توجد ملفات.</Text>}</ScrollView>
    <View style={s.workPane}>
      <View style={s.ideToolbar}><Text style={s.fileTitle}>{selected||'المحرر'}</Text><View style={s.toolbarBtns}><Pressable onPress={()=>setTab('code')} style={s.smallBtn}><Text style={s.smallBtnText}>الكود</Text></Pressable><Pressable onPress={()=>setTab('preview')} style={s.smallBtn}><Text style={s.smallBtnText}>المعاينة</Text></Pressable><Pressable onPress={()=>setTab('agent')} style={s.smallBtn}><Text style={s.smallBtnText}>السجل</Text></Pressable></View></View>
      {tab==='preview'?<View style={s.preview}><WebView key={previewKey} source={{uri:base+'/preview'}} style={s.web} originWhitelist={['*']} /></View>:tab==='agent'?<ScrollView style={s.panel} contentContainerStyle={s.logs}>{logs.map(m=><View key={m.id} style={[s.log,m.role==='user'&&s.user]}><Text style={s.logRole}>{m.role==='user'?'أنت':'BMZ AI'}</Text><Text style={s.logText}>{m.text}</Text></View>)}</ScrollView>:<View style={s.panel}><View style={s.codeHead}><Text style={s.fileTitle}>{selected||'لا يوجد ملف'}</Text><Pressable onPress={saveFile} style={s.smallBtn}><Text style={s.smallBtnText}>حفظ</Text></Pressable></View><TextInput value={code} onChangeText={setCode} multiline style={s.editor} textAlign="left" autoCapitalize="none" autoCorrect={false}/></View>}
    </View>
   </View> :
   <>
   {tab==='files'&&<ScrollView style={s.panel}>{files.length?files.map(p=><Pressable key={p} onPress={()=>openFile(p)} style={s.file}><Text style={s.fileText}>{p}</Text></Pressable>):<Text style={s.empty}>أنشئ مشروعًا أو ابدأ مهمة لتظهر الملفات.</Text>}</ScrollView>}
   {tab==='code'&&<View style={s.panel}><View style={s.codeHead}><Text style={s.fileTitle}>{selected||'لا يوجد ملف'}</Text><Pressable onPress={saveFile} style={s.smallBtn}><Text style={s.smallBtnText}>حفظ</Text></Pressable></View><TextInput value={code} onChangeText={setCode} multiline style={s.editor} textAlign="left" autoCapitalize="none" autoCorrect={false}/></View>}
   {tab==='preview'&&<View style={s.preview}><WebView key={previewKey} source={{uri:base+'/preview'}} style={s.web} originWhitelist={['*']} renderError={()=> <Text style={s.empty}>لا توجد معاينة HTML في المشروع الحالي.</Text>}/></View>}
   {tab==='agent'&&<ScrollView style={s.panel} contentContainerStyle={s.logs}>{logs.map(m=><View key={m.id} style={[s.log,m.role==='user'&&s.user]}><Text style={s.logRole}>{m.role==='user'?'أنت':'BMZ AI'}</Text><Text style={s.logText}>{m.text}</Text></View>)}</ScrollView>}
   </>
  </View>
  <View style={s.actions}><Pressable onPress={commit} disabled={!projectId||sending} style={s.commit}><Text style={s.commitText}>حفظ إلى GitHub</Text></Pressable>{commitStatus?<Text style={s.status}>{commitStatus}</Text>:null}</View>
  <View style={s.composer}><TextInput value={message} onChangeText={setMessage} placeholder="اكتب: أنشئ تطبيقًا، أصلح الخطأ، افحص المشروع..." placeholderTextColor="#777" style={s.message} multiline/><Pressable onPress={()=>void send()} disabled={!message.trim()||sending} style={s.send}><Text style={s.sendText}>{sending?'…':'↑'}</Text></Pressable></View>
  {approval&&<View style={s.approval}><Text style={s.approvalText}>{approval.reason}</Text><Pressable onPress={()=>void approve()} style={s.approve}><Text style={s.approveText}>موافقة وتنفيذ</Text></Pressable></View>}
 </KeyboardAvoidingView></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#080808'},fill:{flex:1},header:{padding:16,borderBottomWidth:1,borderBottomColor:'#202020',flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},brand:{color:'#fff',fontSize:22,fontWeight:'900',textAlign:'right'},sub:{color:'#777',fontSize:11,marginTop:3,textAlign:'right'},dot:{width:9,height:9,borderRadius:5,backgroundColor:'#45d483'},repoBox:{padding:10,borderBottomWidth:1,borderBottomColor:'#1c1c1c'},input:{backgroundColor:'#141414',color:'#fff',borderRadius:12,padding:12,textAlign:'right'},tabs:{flexDirection:'row-reverse',borderBottomWidth:1,borderBottomColor:'#222'},tab:{flex:1,paddingVertical:12,alignItems:'center'},active:{borderBottomWidth:2,borderBottomColor:'#fff'},tabText:{color:'#aaa',fontSize:12},body:{flex:1},ideSplit:{flex:1,flexDirection:'row-reverse'},filePane:{width:'28%',borderLeftWidth:1,borderLeftColor:'#222',padding:8},workPane:{flex:1},ideToolbar:{padding:8,borderBottomWidth:1,borderBottomColor:'#222',flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},toolbarBtns:{flexDirection:'row-reverse',gap:6},panel:{flex:1,padding:12},file:{padding:13,borderBottomWidth:1,borderBottomColor:'#1d1d1d'},fileText:{color:'#ddd',fontSize:13,textAlign:'left'},empty:{color:'#777',textAlign:'center',padding:30},codeHead:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',marginBottom:8},fileTitle:{color:'#ddd',fontSize:12},smallBtn:{paddingHorizontal:14,paddingVertical:9,borderRadius:9,backgroundColor:'#fff'},smallBtnText:{color:'#080808',fontWeight:'800'},editor:{flex:1,backgroundColor:'#101010',color:'#eaeaea',borderRadius:10,padding:12,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',fontSize:12,lineHeight:19},preview:{flex:1,backgroundColor:'#fff'},web:{flex:1},logs:{gap:10},log:{backgroundColor:'#141414',borderRadius:12,padding:12},user:{backgroundColor:'#fff'},logRole:{color:'#777',fontSize:10,marginBottom:4},logText:{color:'#eee',fontSize:13,lineHeight:20,textAlign:'right'},actions:{padding:8,borderTopWidth:1,borderTopColor:'#222'},commit:{backgroundColor:'#fff',borderRadius:10,padding:11,alignItems:'center'},commitText:{color:'#080808',fontWeight:'800'},status:{color:'#888',fontSize:10,textAlign:'center',marginTop:5},composer:{padding:10,borderTopWidth:1,borderTopColor:'#222',flexDirection:'row-reverse',alignItems:'flex-end',gap:7},message:{flex:1,minHeight:48,maxHeight:100,backgroundColor:'#141414',borderRadius:14,color:'#fff',padding:11,textAlign:'right'},send:{width:44,height:44,borderRadius:13,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},sendText:{color:'#080808',fontSize:22,fontWeight:'800'},approval:{padding:10,backgroundColor:'#171717',borderTopWidth:1,borderTopColor:'#333'},approvalText:{color:'#ddd',fontSize:12,textAlign:'right',marginBottom:8},approve:{backgroundColor:'#fff',padding:12,borderRadius:10,alignItems:'center'},approveText:{color:'#080808',fontWeight:'800'}});
