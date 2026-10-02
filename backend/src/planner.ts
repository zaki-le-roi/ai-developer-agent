import type { AgentPlan } from '../../shared/contracts.js';
import type { ModelProvider } from './model-provider.js';

function fallbackPlan(goal:string):AgentPlan{
 const v=goal.toLowerCase(), android=/(android|أندرويد|اندرويد|apk|تطبيق|app|mobile)/i.test(v), inspect=/(حلل|حلّل|افحص|تحقق|inspect|review|debug)/i.test(v), preview=/(preview|معاينة|شاهد|اعرض|واجهة)/i.test(v), test=/(اختبر|اختبار|test|build|بناء|شغّل|شغل)/i.test(v);
 const steps:any[]=[{id:'inspect',title:'فحص مساحة العمل',status:'pending',action:{type:'inspect_workspace'}}];
 if(android) steps.push({id:'create',title:'إنشاء تطبيق Android فعلي',status:'pending',action:{type:'scaffold_app'}});
 if(inspect) steps.push({id:'files',title:'قراءة ملفات المشروع',status:'pending',action:{type:'list_files'}});
 if(!android&&!inspect) steps.push({id:'task',title:'تنفيذ المهمة',status:'pending',action:{type:'write_file',path:'.bmz-task.txt',content:goal.trim()}});
 if(preview) steps.push({id:'preview',title:'بناء المعاينة',status:'pending',action:{type:'preview_web'}});
 if(test||android) steps.push({id:'test',title:'اختبار المشروع',status:'pending',action:{type:'test'}});
 if(android) steps.push({id:'android',title:'إنتاج نسخة Android',status:'pending',action:{type:'build_android'}});
 if(steps.length===1) steps.push({id:'task',title:'تنفيذ المهمة',status:'pending',action:{type:'write_file',path:'.bmz-task.txt',content:goal.trim()}},{id:'test',title:'التحقق',status:'pending',action:{type:'test'}});
 return {goal:goal.trim(),steps} as AgentPlan;
}
function extractJson(t:string):unknown{const s=t.indexOf('{'),e=t.lastIndexOf('}');if(s<0||e<=s)throw new Error('خطة JSON غير صالحة.');return JSON.parse(t.slice(s,e+1));}
export async function createPlan(goal:string,provider?:ModelProvider):Promise<AgentPlan>{
 const fallback=fallbackPlan(goal); if(!provider||provider.name==='unconfigured')return fallback;
 try{const raw=extractJson(await provider.generate(['أنت مخطط BMZ AI.','أنشئ خطة تنفيذ فعلية.','الأنواع: inspect_workspace,list_files,read_file,write_file,run_command,preview_web,build_android,scaffold_app,test.','عند طلب تطبيق Android أنشئه واختبره ثم جهز نسخة Android.','أرجع JSON فقط.',`الطلب: ${goal}`].join('\\n'))) as any;
 if(!raw||!Array.isArray(raw.steps)||!raw.steps.length)return fallback;
 return {goal:goal.trim(),steps:raw.steps.slice(0,16).filter((s:any)=>s&&typeof s.title==='string'&&s.action&&typeof s.action.type==='string').map((s:any,i:number)=>({id:typeof s.id==='string'?s.id:`step-${i+1}`,title:s.title,status:'pending',action:s.action}))} as AgentPlan;
 }catch{return fallback;}
}
