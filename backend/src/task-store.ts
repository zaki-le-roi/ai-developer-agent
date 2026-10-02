import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type TaskStatus = 'pending'|'running'|'paused'|'waiting_approval'|'failed'|'completed'|'cancelled';
export type Task = { id:string; userId:string; projectId:string|null; message:string; status:TaskStatus; createdAt:string; updatedAt:string; result?:unknown; error?:string };
const dir=path.resolve(process.env.BMZ_DATA_ROOT??path.join(process.cwd(),'backend','data'));
const file=path.join(dir,'tasks.json');
async function load():Promise<Task[]>{try{const x=JSON.parse(await fs.readFile(file,'utf8')) as unknown;return Array.isArray(x)?x as Task[]:[]}catch{return[]}}
async function save(x:Task[]){await fs.mkdir(dir,{recursive:true});const t=file+'.tmp-'+randomUUID();await fs.writeFile(t,JSON.stringify(x,null,2));await fs.rename(t,file)}
export async function createTask(userId:string,projectId:string|null,message:string){const now=new Date().toISOString();const task:Task={id:randomUUID(),userId,projectId,message,status:'pending',createdAt:now,updatedAt:now};const x=await load();x.push(task);await save(x);return task}
export async function getTask(id:string,userId:string){return(await load()).find(x=>x.id===id&&x.userId===userId)??null}
export async function listTasks(userId:string,projectId?:string){return(await load()).filter(t=>t.userId===userId&&(!projectId||t.projectId===projectId))}
export async function updateTask(id:string,userId:string,patch:Partial<Task>){const x=await load();const i=x.findIndex(t=>t.id===id&&t.userId===userId);if(i<0)throw new Error('task not found');x[i]={...x[i],...patch,updatedAt:new Date().toISOString()};await save(x);return x[i]}