import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSandboxWorkspace } from './sandbox-core.js';
import { getProject } from './project-store.js';
import { githubToken } from './github-auth.js';

type Repo={owner?:string;name?:string;default_branch?:string};
function repoParts(url:string){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='github.com')throw new Error('يسمح فقط بـ github.com عبر HTTPS.');const p=u.pathname.split('/').filter(Boolean);if(p.length<2)throw new Error('رابط GitHub غير صالح.');return {owner:p[0],name:p[1].replace(/\.git$/i,'')};}
async function api<T>(userId:string,url:string,init?:RequestInit):Promise<T>{const credential=githubToken(userId);if(!credential)throw new Error('GitHub credential غير مضبوط على الخادم.');const r=await fetch(url,{...init,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','Authorization':`Bearer ${process.env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BMZ-AI'}});if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);return r.json() as Promise<T>;}
async function collect(root:string,dir:string,out:{path:string;content:Buffer}[]){const es=await fs.readdir(dir,{withFileTypes:true});for(const e of es){if(['.git','node_modules','build','dist','.gradle','.bmz'].includes(e.name))continue;const t=path.join(dir,e.name);if(e.isDirectory())await collect(root,t,out);else{const b=await fs.readFile(t);if(b.length<=1_000_000)out.push({path:path.relative(root,t).split(path.sep).join('/'),content:b});}}}
async function loadManifest(root:string):Promise<string[]>{try{const raw=await fs.readFile(path.join(root,'.bmz','import-manifest.json'),'utf8');const value=JSON.parse(raw) as {paths?:unknown};return Array.isArray(value.paths)?value.paths.filter((x):x is string=>typeof x==='string'):[];}catch{return [];}}
function isLikelyTextPath(filePath:string){return !/\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|7z|rar|exe|dll|so|dylib|mp3|mp4|mov|avi|woff2?|ttf|otf)$/i.test(filePath);}
export async function commitWorkspaceToGitHub(projectId:string,userId:string,message:string){
 const project=await getProject(projectId,userId); if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بمستودع GitHub.');
 const {owner,name}=repoParts(project.repositoryUrl); const repo=await api<Repo>(userId,`https://api.github.com/repos/${owner}/${name}`); const branch=repo.default_branch||'main';
 const ref=await api<{object:{sha:string}}>(userId,`https://api.github.com/repos/${owner}/${name}/git/ref/heads/${branch}`);
 const base=await api<{tree:{sha:string}}>(userId,`https://api.github.com/repos/${owner}/${name}/git/commits/${ref.object.sha}`);
 const ws=await createSandboxWorkspace(projectId); const items:{path:string;content:Buffer}[]=[]; await collect(ws.directory,ws.directory,items);
 if(!items.length)throw new Error('لا توجد ملفات في مساحة العمل لإرسالها.');
 const localPaths=new Set(items.map(item=>item.path));
 const manifest=await loadManifest(ws.directory);
 const remoteTree=await api<{tree:Array<{path:string;type:string;sha:string;mode:string}>;truncated?:boolean}>(userId,`https://api.github.com/repos/${owner}/${name}/git/trees/${ref.object.sha}?recursive=1`);
 if(remoteTree.truncated)throw new Error('شجرة GitHub كبيرة جدًا لمزامنة الحذف بأمان.');
 const tree:any[]=[];
 for(const item of items){const blob=await api<{sha:string}>(userId,`https://api.github.com/repos/${owner}/${name}/git/blobs`,{method:'POST',body:JSON.stringify({content:item.content.toString('base64'),encoding:'base64'})});tree.push({path:item.path,mode:'100644',type:'blob',sha:blob.sha});}
 const managedPaths=new Set(manifest);
 for(const item of items) managedPaths.add(item.path);
 for(const remote of remoteTree.tree){if(remote.type==='blob'&&managedPaths.has(remote.path)&&!localPaths.has(remote.path)&&isLikelyTextPath(remote.path))tree.push({path:remote.path,mode:remote.mode||'100644',type:'blob',sha:null});}
 if(!tree.length)throw new Error('لا توجد تغييرات لإرسالها إلى GitHub.');
 const created=await api<{sha:string}>(userId,`https://api.github.com/repos/${owner}/${name}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:base.tree.sha,tree})});
 const commit=await api<{sha:string}>(userId,`https://api.github.com/repos/${owner}/${name}/git/commits`,{method:'POST',body:JSON.stringify({message:message.slice(0,200)||'BMZ AI update',tree:created.sha,parents:[ref.object.sha]})});
 await api<any>(userId,`https://api.github.com/repos/${owner}/${name}/git/refs/heads/${branch}`,{method:'PATCH',body:JSON.stringify({sha:commit.sha,force:false})});
 let buildTriggered=false;
 try { await api<any>(userId,`https://api.github.com/repos/${owner}/${name}/dispatches`,{method:'POST',body:JSON.stringify({event_type:'bmz_android_build',client_payload:{projectPath:'.',commitSha:commit.sha}})}); buildTriggered=true; } catch { buildTriggered=false; }
 return {repository:`${owner}/${name}`,branch,commitSha:commit.sha,buildTriggered};
}
