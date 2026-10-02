import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSandboxWorkspace } from './sandbox-core.js';
import { getProject } from './project-store.js';

type Repo={owner?:string;name?:string;default_branch?:string};
function repoParts(url:string){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='github.com')throw new Error('يسمح فقط بـ github.com عبر HTTPS.');const p=u.pathname.split('/').filter(Boolean);if(p.length<2)throw new Error('رابط GitHub غير صالح.');return {owner:p[0],name:p[1].replace(/\.git$/i,'')};}
async function api<T>(url:string,init?:RequestInit):Promise<T>{if(!process.env.GITHUB_TOKEN)throw new Error('GITHUB_TOKEN غير مضبوط على الخادم.');const r=await fetch(url,{...init,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','Authorization':`Bearer ${process.env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BMZ-AI'}});if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);return r.json() as Promise<T>;}
async function collect(root:string,dir:string,out:{path:string;content:Buffer}[]){const es=await fs.readdir(dir,{withFileTypes:true});for(const e of es){if(['.git','node_modules','build','dist'].includes(e.name))continue;const t=path.join(dir,e.name);if(e.isDirectory())await collect(root,t,out);else{const b=await fs.readFile(t);if(b.length<=1_000_000)out.push({path:path.relative(root,t).split(path.sep).join('/'),content:b});}}}
export async function commitWorkspaceToGitHub(projectId:string,message:string){
 const project=await getProject(projectId); if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بمستودع GitHub.');
 const {owner,name}=repoParts(project.repositoryUrl); const repo=await api<Repo>(`https://api.github.com/repos/${owner}/${name}`); const branch=repo.default_branch||'main';
 const ref=await api<{object:{sha:string}}>(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/${branch}`);
 const base=await api<{tree:{sha:string}}>(`https://api.github.com/repos/${owner}/${name}/git/commits/${ref.object.sha}`);
 const ws=await createSandboxWorkspace(projectId); const items:{path:string;content:Buffer}[]=[]; await collect(ws.directory,ws.directory,items);
 if(!items.length)throw new Error('لا توجد ملفات في مساحة العمل لإرسالها.');
 const tree:any[]=[];
 for(const item of items){const blob=await api<{sha:string}>(`https://api.github.com/repos/${owner}/${name}/git/blobs`,{method:'POST',body:JSON.stringify({content:item.content.toString('base64'),encoding:'base64'})});tree.push({path:item.path,mode:'100644',type:'blob',sha:blob.sha});}
 const created=await api<{sha:string}>(`https://api.github.com/repos/${owner}/${name}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:base.tree.sha,tree})});
 const commit=await api<{sha:string}>(`https://api.github.com/repos/${owner}/${name}/git/commits`,{method:'POST',body:JSON.stringify({message:message.slice(0,200)||'BMZ AI update',tree:created.sha,parents:[ref.object.sha]})});
 await api(`https://api.github.com/repos/${owner}/${name}/git/refs/heads/${branch}`,{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});
 let buildTriggered=false;
 try { await api(`https://api.github.com/repos/${owner}/${name}/dispatches`,{method:'POST',body:JSON.stringify({event_type:'bmz_android_build',client_payload:{projectPath:'.',commitSha:commit.sha}})}); buildTriggered=true; } catch { buildTriggered=false; }
 return {repository:`${owner}/${name}`,branch,commitSha:commit.sha,buildTriggered};
}
