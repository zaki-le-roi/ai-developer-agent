import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

export type PermissionName='READ_PROJECT'|'WRITE_PROJECT'|'DELETE_FILE'|'RUN_COMMAND'|'NETWORK_ACCESS'|'GITHUB_READ'|'GITHUB_WRITE'|'GITHUB_PUSH'|'GITHUB_MERGE'|'SEND_MESSAGE'|'BROWSER_AUTOMATION'|'SCHEDULE_WORKFLOW';
type Grant={id:string;userId:string;projectId:string|null;permission:PermissionName;enabled:boolean;scope?:string;createdAt:string};
let ready=false;

async function migrateLegacy(){
  if(ready)return;
  const db=getDb();ready=true;
  const count=Number((db.prepare('SELECT COUNT(*) AS count FROM permissions').get() as {count:number}).count);
  if(count>0)return;
  const file=path.resolve(process.env.BMZ_DATA_ROOT??path.join(process.cwd(),'backend','data'),'permissions.json');
  try{
    const raw=JSON.parse(await fs.readFile(file,'utf8')) as unknown;
    if(!Array.isArray(raw))return;
    const insert=db.prepare('INSERT OR IGNORE INTO permissions(id,user_id,project_id,permission,enabled,scope,created_at) VALUES(?,?,?,?,?,?,?)');
    const tx=db.transaction((items:unknown[])=>{for(const item of items){if(!item||typeof item!=='object')continue;const g=item as Record<string,unknown>;if(typeof g.id!=='string'||typeof g.userId!=='string'||typeof g.permission!=='string'||typeof g.createdAt!=='string')continue;insert.run(g.id,g.userId,typeof g.projectId==='string'?g.projectId:null,g.permission,g.enabled===false?0:1,typeof g.scope==='string'?g.scope:null,g.createdAt);}});
    tx(raw);
  }catch{}
}

function map(row:any):Grant{return{id:String(row.id),userId:String(row.user_id),projectId:row.project_id===null?null:String(row.project_id),permission:row.permission as PermissionName,enabled:Boolean(row.enabled),...(row.scope?{scope:String(row.scope)}:{}),createdAt:String(row.created_at)}}

export async function grantPermission(userId:string,projectId:string|null,permission:PermissionName,scope?:string){await migrateLegacy();const db=getDb();const existing=db.prepare('SELECT id,created_at FROM permissions WHERE user_id=? AND project_id IS ? AND permission=? AND scope IS ?').get(userId,projectId,permission,scope??null) as {id?:string;created_at?:string}|undefined;const g={id:existing?.id??randomUUID(),userId,projectId,permission,enabled:true,scope,createdAt:existing?.created_at??new Date().toISOString()};db.prepare('INSERT INTO permissions(id,user_id,project_id,permission,enabled,scope,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,scope=excluded.scope').run(g.id,userId,projectId,permission,1,scope??null,g.createdAt);return g}
export async function revokePermission(id:string,userId:string){await migrateLegacy();const result=getDb().prepare('UPDATE permissions SET enabled=0 WHERE id=? AND user_id=?').run(id,userId);return Number(result.changes)>0}
export async function hasPermission(userId:string,projectId:string|null,permission:PermissionName){await migrateLegacy();const row=getDb().prepare('SELECT 1 AS ok FROM permissions WHERE user_id=? AND enabled=1 AND permission=? AND (project_id=? OR project_id IS NULL) LIMIT 1').get(userId,permission,projectId) as {ok?:number}|undefined;return Boolean(row?.ok)}
export async function listPermissions(userId:string){await migrateLegacy();return getDb().prepare('SELECT * FROM permissions WHERE user_id=? ORDER BY created_at DESC').all(userId).map(map)}
