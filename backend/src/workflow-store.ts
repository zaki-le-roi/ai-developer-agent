import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Workflow} from './workflow-engine.js';
type StoredWorkflow={id:string;userId:string;projectId:string;name:string;workflow:Workflow;createdAt:string;updatedAt:string};
const dir=path.resolve(process.env.BMZ_DATA_ROOT??path.join(process.cwd(),'backend','data'));const file=path.join(dir,'workflows.json');
async function load():Promise<StoredWorkflow[]>{try{return JSON.parse(await fs.readFile(file,'utf8')) as StoredWorkflow[]}catch{return[]}}
async function save(x:StoredWorkflow[]){await fs.mkdir(dir,{recursive:true});const t=file+'.tmp-'+randomUUID();await fs.writeFile(t,JSON.stringify(x,null,2),'utf8');await fs.rename(t,file)}
export async function listWorkflows(userId:string,projectId?:string){return(await load()).filter(x=>x.userId===userId&&(!projectId||x.projectId===projectId))}
export async function getWorkflow(userId:string,id:string){return(await load()).find(x=>x.userId===userId&&x.id===id)??null}
export async function createWorkflow(userId:string,projectId:string,name:string,workflow:Workflow){const now=new Date().toISOString();const item:StoredWorkflow={id:randomUUID(),userId,projectId,name:name.trim().slice(0,120)||workflow.name||'Workflow',workflow:{...workflow,id:workflow.id||randomUUID(),name:name.trim()||workflow.name||'Workflow'},createdAt:now,updatedAt:now};const x=await load();x.push(item);await save(x);return item}
export async function updateWorkflow(userId:string,id:string,patch:Partial<Pick<StoredWorkflow,'name'|'workflow'>>){const x=await load();const i=x.findIndex(w=>w.id===id&&w.userId===userId);if(i<0)throw new Error('workflow not found');x[i]={...x[i],...patch,updatedAt:new Date().toISOString()};await save(x);return x[i]}
export async function deleteWorkflow(userId:string,id:string){const x=await load();const next=x.filter(w=>!(w.id===id&&w.userId===userId));if(next.length===x.length)return false;await save(next);return true}