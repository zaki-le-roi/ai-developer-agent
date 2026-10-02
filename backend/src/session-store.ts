import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentSession } from '../../shared/contracts.js';
type StoredSession=AgentSession&{userId:string};
const dataDir=path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(),'backend','data'));
const dataFile=path.join(dataDir,'sessions.json');
async function load():Promise<StoredSession[]>{try{const value=JSON.parse(await fs.readFile(dataFile,'utf8')) as unknown;return Array.isArray(value)?value as StoredSession[]:[]}catch{return[]}}
async function save(items:StoredSession[]){await fs.mkdir(dataDir,{recursive:true});const temp=dataFile+'.tmp-'+randomUUID();await fs.writeFile(temp,JSON.stringify(items,null,2),'utf8');await fs.rename(temp,dataFile)}
export async function createSession(userId:string,projectId:string|null):Promise<AgentSession>{const items=await load();const now=new Date().toISOString();const session:StoredSession={id:randomUUID(),userId,projectId,createdAt:now,updatedAt:now};items.push(session);await save(items);return session}
export async function getSession(userId:string,id:string):Promise<AgentSession|null>{return(await load()).find(item=>item.id===id&&item.userId===userId)??null}
export async function touchSession(userId:string,id:string):Promise<AgentSession|null>{const items=await load();const index=items.findIndex(item=>item.id===id&&item.userId===userId);if(index<0)return null;items[index]={...items[index],updatedAt:new Date().toISOString()};await save(items);return items[index]}