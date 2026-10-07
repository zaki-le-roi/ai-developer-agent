import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type MemoryEntry={id:string;projectId:string|null;type:'task'|'error'|'solution'|'test';content:string;createdAt:string};

const dataDir=path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(),'backend','data'));
mkdirSync(dataDir,{recursive:true});
const dbPath=path.join(dataDir,'bmz-agent.sqlite');
const db=new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS agent_memory (
 id TEXT PRIMARY KEY,
 project_id TEXT,
 type TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_project_created ON agent_memory(project_id, created_at);
`);

export async function remember(projectId:string|null,type:MemoryEntry['type'],content:string):Promise<MemoryEntry>{
  const entry:MemoryEntry={id:randomUUID(),projectId,type,content,createdAt:new Date().toISOString()};
  db.prepare('INSERT INTO agent_memory (id, project_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)').run(entry.id,entry.projectId,entry.type,entry.content,entry.createdAt);
  return entry;
}

export async function recall(projectId?:string):Promise<MemoryEntry[]>{
  const rows=projectId
    ? db.prepare('SELECT id, project_id as projectId, type, content, created_at as createdAt FROM agent_memory WHERE project_id = ? ORDER BY created_at DESC LIMIT 200').all(projectId)
    : db.prepare('SELECT id, project_id as projectId, type, content, created_at as createdAt FROM agent_memory ORDER BY created_at DESC LIMIT 200').all();
  return rows as unknown as MemoryEntry[];
}
