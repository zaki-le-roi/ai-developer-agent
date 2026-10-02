import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ApprovalRequest } from '../../shared/contracts.js';

type StoredApproval = ApprovalRequest & { userId: string };
const dataDir = path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(), 'backend', 'data'));
const dataFile = path.join(dataDir, 'approvals.json');
const TTL_MS = 10 * 60 * 1000;

async function load(): Promise<StoredApproval[]> {
  try { const value = JSON.parse(await fs.readFile(dataFile, 'utf8')) as unknown; return Array.isArray(value) ? value as StoredApproval[] : []; }
  catch { return []; }
}
async function save(items: StoredApproval[]) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = dataFile + '.tmp-' + randomUUID();
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(temp, dataFile);
}
export async function requestApproval(userId:string,projectId:string|null,action:string,reason:string):Promise<ApprovalRequest>{
  const items=await load();const now=Date.now();
  const request:StoredApproval={id:randomUUID(),userId,projectId,action,reason,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+TTL_MS).toISOString(),approved:false};
  items.push(request);await save(items);return request;
}
export async function approveRequest(userId:string,id:string):Promise<ApprovalRequest|null>{
  const items=await load();const index=items.findIndex(item=>item.id===id&&item.userId===userId);
  if(index<0||Date.parse(items[index].expiresAt)<Date.now())return null;
  items[index]={...items[index],approved:true};await save(items);return items[index];
}
export async function consumeApproval(userId:string,id:string):Promise<boolean>{
  const items=await load();const index=items.findIndex(item=>item.id===id&&item.userId===userId);
  if(index<0)return false;const item=items[index];
  if(!item.approved||Date.parse(item.expiresAt)<Date.now())return false;
  items.splice(index,1);await save(items);return true;
}