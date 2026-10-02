import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Workflow } from './workflow-engine.js';

type StoredWorkflow={id:string;userId:string;projectId:string;name:string;workflow:Workflow;createdAt:string;updatedAt:string};
let ready=false;

function ensureSchema(){
  if(ready)return;
  const db=getDb();
  try{db.exec('ALTER TABLE workflows ADD COLUMN updated_at TEXT');}catch{}
  ready=true;
}

async function migrateLegacy(){
  ensureSchema();
  const db=getDb();
  const count=Number((db.prepare('SELECT COUNT(*) AS count FROM workflows').get() as {count:number}).count);
  if(count>0)return;
  const file=path.resolve(process.env.BMZ_DATA_ROOT??path.join(process.cwd(),'backend','data'),'workflows.json');
  try{
    const raw=JSON.parse(await fs.readFile(file,'utf8')) as unknown;
    if(!Array.isArray(raw))return;
    const insert=db.prepare('INSERT OR IGNORE INTO workflows(id,user_id,project_id,name,definition_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
    for(const item of raw){
        if(!item||typeof item!=='object')continue;
        const w=item as Record<string,unknown>;
        if(typeof w.id!=='string'||typeof w.userId!=='string'||typeof w.projectId!=='string'||typeof w.name!=='string'||typeof w.createdAt!=='string')continue;
        const workflow=w.workflow&&typeof w.workflow==='object'?w.workflow:null;
        if(!workflow)continue;
        insert.run(w.id,w.userId,w.projectId,w.name,JSON.stringify(workflow),w.createdAt,typeof w.updatedAt==='string'?w.updatedAt:w.createdAt);
    }
  }catch{}
}

function map(row:any):StoredWorkflow{
  const workflow=JSON.parse(String(row.definition_json)) as Workflow;
  return {id:String(row.id),userId:String(row.user_id),projectId:String(row.project_id),name:String(row.name),workflow,createdAt:String(row.created_at),updatedAt:String(row.updated_at||row.created_at)};
}

export async function listWorkflows(userId:string,projectId?:string){await migrateLegacy();const rows=getDb().prepare(projectId?'SELECT * FROM workflows WHERE user_id=? AND project_id=? ORDER BY created_at DESC':'SELECT * FROM workflows WHERE user_id=? ORDER BY created_at DESC').all(...(projectId?[userId,projectId]:[userId]));return rows.map(map)}
export async function getWorkflow(userId:string,id:string){await migrateLegacy();const row=getDb().prepare('SELECT * FROM workflows WHERE id=? AND user_id=?').get(id,userId);return row?map(row):null}
export async function createWorkflow(userId:string,projectId:string,name:string,workflow:Workflow){
  await migrateLegacy();const now=new Date().toISOString();const item:StoredWorkflow={id:randomUUID(),userId,projectId,name:name.trim().slice(0,120)||workflow.name||'Workflow',workflow:{...workflow,id:workflow.id||randomUUID(),name:name.trim()||workflow.name||'Workflow'},createdAt:now,updatedAt:now};
  getDb().prepare('INSERT INTO workflows(id,user_id,project_id,name,definition_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(item.id,userId,projectId,item.name,JSON.stringify(item.workflow),now,now);return item;
}
export async function updateWorkflow(userId:string,id:string,patch:Partial<Pick<StoredWorkflow,'name'|'workflow'>>){
  await migrateLegacy();const current=await getWorkflow(userId,id);if(!current)throw new Error('workflow not found');const next={...current,...patch,updatedAt:new Date().toISOString()};
  getDb().prepare('UPDATE workflows SET name=?,definition_json=?,updated_at=? WHERE id=? AND user_id=?').run(next.name,JSON.stringify(next.workflow),next.updatedAt,id,userId);return next;
}
export async function deleteWorkflow(userId:string,id:string){await migrateLegacy();const result=getDb().prepare('DELETE FROM workflows WHERE id=? AND user_id=?').run(id,userId);return Number(result.changes)>0}
