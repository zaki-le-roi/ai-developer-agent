import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';

export type TaskStatus = 'pending'|'running'|'paused'|'waiting_approval'|'failed'|'completed'|'cancelled';
export type Task = { id:string; userId:string; projectId:string|null; message:string; status:TaskStatus; createdAt:string; updatedAt:string; result?:unknown; error?:string };

let ready=false;

function ensureSchema(){
  if(ready)return;
  const db=getDb();
  try{db.exec('ALTER TABLE tasks ADD COLUMN result_json TEXT');}catch{}
  try{db.exec('ALTER TABLE tasks ADD COLUMN error TEXT');}catch{}
  ready=true;
}

async function migrateLegacy(){
  ensureSchema();
  const db=getDb();
  const count=Number((db.prepare('SELECT COUNT(*) AS count FROM tasks').get() as {count:number}).count);
  if(count>0)return;
  const file=path.resolve(process.env.BMZ_DATA_ROOT??path.join(process.cwd(),'backend','data'),'tasks.json');
  try{
    const raw=JSON.parse(await fs.readFile(file,'utf8')) as unknown;
    if(!Array.isArray(raw))return;
    const insert=db.prepare('INSERT OR IGNORE INTO tasks(id,user_id,project_id,status,message,created_at,updated_at,result_json,error) VALUES(?,?,?,?,?,?,?,?,?)');
    const tx=db.transaction((items:unknown[])=>{
      for(const item of items){
        if(!item||typeof item!=='object')continue;
        const t=item as Record<string,unknown>;
        if(typeof t.id!=='string'||typeof t.userId!=='string'||typeof t.message!=='string'||typeof t.status!=='string'||typeof t.createdAt!=='string'||typeof t.updatedAt!=='string')continue;
        insert.run(t.id,t.userId,typeof t.projectId==='string'?t.projectId:null,t.status,t.message,t.createdAt,t.updatedAt,t.result===undefined?null:JSON.stringify(t.result),typeof t.error==='string'?t.error:null);
      }
    });
    tx(raw);
  }catch{}
}

function map(row:any):Task{
  return {id:String(row.id),userId:String(row.user_id),projectId:row.project_id===null?null:String(row.project_id),message:String(row.message),status:row.status as TaskStatus,createdAt:String(row.created_at),updatedAt:String(row.updated_at),...(row.result_json?{result:JSON.parse(row.result_json)}:{}),...(row.error?{error:String(row.error)}:{})};
}

export async function createTask(userId:string,projectId:string|null,message:string){
  await migrateLegacy();
  const now=new Date().toISOString();
  const task:Task={id:crypto.randomUUID(),userId,projectId,message,status:'pending',createdAt:now,updatedAt:now};
  getDb().prepare('INSERT INTO tasks(id,user_id,project_id,status,message,created_at,updated_at,result_json,error) VALUES(?,?,?,?,?,?,?,?,?)').run(task.id,userId,projectId,'pending',message,now,now,null,null);
  return task;
}
export async function getTask(id:string,userId:string){await migrateLegacy();const row=getDb().prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id,userId);return row?map(row):null}
export async function listTasks(userId:string,projectId?:string){await migrateLegacy();const rows=getDb().prepare(projectId?'SELECT * FROM tasks WHERE user_id=? AND project_id=? ORDER BY created_at DESC':'SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC').all(...(projectId?[userId,projectId]:[userId]));return rows.map(map)}
export async function listAllTasks(){await migrateLegacy();return getDb().prepare('SELECT * FROM tasks ORDER BY created_at ASC').all().map(map)}
export async function updateTask(id:string,userId:string,patch:Partial<Task>){
  await migrateLegacy();
  const current=await getTask(id,userId);if(!current)throw new Error('task not found');
  const next={...current,...patch,updatedAt:new Date().toISOString()};
  getDb().prepare('UPDATE tasks SET project_id=?,status=?,message=?,created_at=?,updated_at=?,result_json=?,error=? WHERE id=? AND user_id=?').run(next.projectId,next.status,next.message,next.createdAt,next.updatedAt,next.result===undefined?null:JSON.stringify(next.result),next.error??null,id,userId);
  return next;
}
