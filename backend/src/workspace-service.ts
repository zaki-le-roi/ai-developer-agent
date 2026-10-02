import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSandboxWorkspace } from './sandbox-core.js';

const MAX_FILES = 500;
const MAX_FILE_BYTES = 500_000;

function safe(root:string, relative:string){
  if(!relative || path.isAbsolute(relative)) throw new Error('المسار يجب أن يكون نسبيًا.');
  const target=path.resolve(root,relative); const rel=path.relative(root,target);
  if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('المسار خارج مساحة المشروع.');
  return target;
}
async function walk(root:string, dir:string, out:string[]){
  if(out.length>=MAX_FILES)return;
  const entries=await fs.readdir(dir,{withFileTypes:true});
  for(const e of entries){
    if(out.length>=MAX_FILES)break;
    if(['node_modules','.git','build','dist'].includes(e.name))continue;
    const target=path.join(dir,e.name); const rel=path.relative(root,target).split(path.sep).join('/');
    if(e.isDirectory()) await walk(root,target,out); else out.push(rel);
  }
}
export async function listWorkspaceFiles(projectId:string){
  const ws=await createSandboxWorkspace(projectId); const out:string[]=[]; await walk(ws.directory,ws.directory,out);
  return {workspaceId:ws.id,files:out};
}
export async function readWorkspaceFile(projectId:string,relative:string){
  const ws=await createSandboxWorkspace(projectId); const target=safe(ws.directory,relative);
  const stat=await fs.stat(target); if(stat.size>MAX_FILE_BYTES) throw new Error('الملف أكبر من الحد المسموح للمعاينة.');
  return {path:relative,content:await fs.readFile(target,'utf8')};
}
export async function writeWorkspaceFile(projectId:string,relative:string,content:string){
  if(content.length>MAX_FILE_BYTES) throw new Error('الملف أكبر من الحد المسموح.');
  const ws=await createSandboxWorkspace(projectId); const target=safe(ws.directory,relative);
  await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,content,'utf8');
  return {path:relative};
}
