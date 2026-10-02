import { runCommandInSandbox, readFileInSandbox, writeFileInSandbox, deleteFileInSandbox } from './sandbox-tools.js';
import { publish } from './event-bus.js';

export type WorkflowNode={id:string;type:string;config:Record<string,unknown>};
export type Workflow={id:string;name:string;nodes:WorkflowNode[];edges:Array<{from:string;to:string}>};

export const WORKFLOW_NODE_TYPES=[
  'ManualTrigger','WebhookTrigger','ScheduleTrigger','RunCommand','ReadFile','WriteFile','DeleteFile',
  'Condition','Loop','Delay','HttpRequest','Log'
] as const;

function validate(workflow:Workflow){
  if(!workflow||!Array.isArray(workflow.nodes)||workflow.nodes.length===0)throw new Error('Workflow يجب أن يحتوي على عقد.');
  if(workflow.nodes.length>100)throw new Error('Workflow يتجاوز الحد الأقصى للعقد.');
  const ids=new Set<string>();
  for(const node of workflow.nodes){
    if(!node.id||ids.has(node.id))throw new Error('معرّف عقدة Workflow غير صالح أو مكرر.');
    if(!WORKFLOW_NODE_TYPES.includes(node.type as typeof WORKFLOW_NODE_TYPES[number]))throw new Error(`Workflow node غير مدعوم: ${node.type}`);
    ids.add(node.id);
    if(typeof node.config!=='object'||node.config===null)throw new Error(`إعدادات العقدة ${node.id} غير صالحة.`);
  }
  for(const edge of workflow.edges??[]){
    if(!ids.has(edge.from)||!ids.has(edge.to))throw new Error('Workflow يحتوي على اتصال إلى عقدة غير موجودة.');
  }
}

function interpolate(value:unknown,outputs:Map<string,unknown>):unknown{
  if(typeof value!=='string')return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_-]+)\.([^}]+)\s*\}\}/g,(_,id,key)=>{
    const out=outputs.get(id) as Record<string,unknown>|undefined;return out&&key in out?String(out[key]):'';
  });
}

async function executeNode(node:WorkflowNode,projectId:string,outputs:Map<string,unknown>):Promise<unknown>{
  const config=Object.fromEntries(Object.entries(node.config).map(([k,v])=>[k,interpolate(v,outputs)]));
  switch(node.type){
    case 'ManualTrigger':
    case 'WebhookTrigger':
    case 'ScheduleTrigger':
      return {triggered:true};
    case 'RunCommand':
      return runCommandInSandbox(projectId,String(config.command??''),Array.isArray(config.args)?config.args.map(String):[]);
    case 'ReadFile':
      return readFileInSandbox(projectId,String(config.path??''));
    case 'WriteFile':
      return writeFileInSandbox(projectId,String(config.path??''),String(config.content??''));
    case 'DeleteFile':
      return deleteFileInSandbox(projectId,String(config.path??''));
    case 'Delay':
      await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(0,Number(config.ms??0)))));
      return {ok:true};
    case 'Condition':
      return {result:Boolean(config.value),branch:Boolean(config.value)?'true':'false'};
    case 'Loop':{
      const count=Math.min(50,Math.max(0,Number(config.count??0)));
      return {iterations:count};
    }
    case 'HttpRequest':{
      const url=new URL(String(config.url??''));
      if(url.protocol!=='https:')throw new Error('HttpRequest يسمح فقط بـ HTTPS.');
      const response=await fetch(url,{method:String(config.method??'GET').toUpperCase(),headers:{Accept:'application/json','Content-Type':'application/json'},body:config.body===undefined?undefined:JSON.stringify(config.body)});
      const text=await response.text();
      if(text.length>100000)throw new Error('استجابة HTTP كبيرة جدًا.');
      return {status:response.status,ok:response.ok,body:text};
    }
    case 'Log':
      return {message:String(config.message??'')};
    default:throw new Error(`Workflow node غير مدعوم: ${node.type}`);
  }
}

export async function runWorkflow(workflow:Workflow,projectId:string){
  validate(workflow);
  const outputs=new Map<string,unknown>();
  const incoming=(id:string)=>workflow.edges.filter(e=>e.to===id).map(e=>e.from);
  const done=new Set<string>();
  let guard=0;
  while(done.size<workflow.nodes.length&&guard++<workflow.nodes.length*3){
    let progressed=false;
    for(const node of workflow.nodes){
      if(done.has(node.id)||incoming(node.id).some(x=>!done.has(x)))continue;
      publish({type:'workflow.node.started',projectId,data:{workflowId:workflow.id,nodeId:node.id,type:node.type}});
      try{
        const output=await executeNode(node,projectId,outputs);
        outputs.set(node.id,output);done.add(node.id);
        publish({type:'workflow.node.completed',projectId,data:{workflowId:workflow.id,nodeId:node.id,output}});
        progressed=true;
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        publish({type:'workflow.node.failed',projectId,data:{workflowId:workflow.id,nodeId:node.id,error:message}});
        throw error;
      }
    }
    if(!progressed)break;
  }
  if(done.size!==workflow.nodes.length)throw new Error('Workflow يحتوي على دورة أو عقدة غير قابلة للتنفيذ.');
  return Object.fromEntries(outputs);
}