import AdmZip from 'adm-zip';
import { getProject } from './project-store.js';

function parts(url:string){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='github.com')throw new Error('رابط GitHub غير صالح.');const p=u.pathname.split('/').filter(Boolean);if(p.length<2)throw new Error('رابط GitHub غير صالح.');return {owner:p[0],name:p[1].replace(/\.git$/i,'')};}
async function api<T>(url:string,init?:RequestInit):Promise<T>{if(!process.env.GITHUB_TOKEN)throw new Error('GITHUB_TOKEN غير مضبوط.');const r=await fetch(url,{...init,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BMZ-AI'}});if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);return r.json() as Promise<T>;}
async function raw(url:string):Promise<Buffer>{if(!process.env.GITHUB_TOKEN)throw new Error('GITHUB_TOKEN غير مضبوط.');const r=await fetch(url,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BMZ-AI'}});if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}
export async function latestAndroidBuild(projectId:string){
 const project=await getProject(projectId);if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بـ GitHub.');
 const {owner,name}=parts(project.repositoryUrl);
 const runs=await api<{workflow_runs:Array<{id:number;status:string;conclusion:string|null;html_url:string;head_sha:string;created_at:string;updated_at:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs?per_page=50`);
 const run=runs.workflow_runs.find(x=>x.status==='in_progress'||x.status==='queued')??runs.workflow_runs.find(x=>x.conclusion==='success'||x.conclusion==='failure'||x.conclusion==='cancelled');
 if(!run)return {found:false};
 const artifacts=await api<{artifacts:Array<{id:number;name:string;expired:boolean;size_in_bytes:number;archive_download_url:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs/${run.id}/artifacts?per_page=50`);
 const apk=artifacts.artifacts.find(x=>x.name==='bmz-ai-debug-apk'&&!x.expired);
 return {found:true,run:{id:run.id,status:run.status,conclusion:run.conclusion,htmlUrl:run.html_url,headSha:run.head_sha,updatedAt:run.updated_at},artifact:apk?{id:apk.id,name:apk.name,size:apk.size_in_bytes,downloadUrl:apk.archive_download_url}:null};
}
export async function downloadLatestAndroidArtifact(projectId:string){
 const project=await getProject(projectId);if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بـ GitHub.');
 const {owner,name}=parts(project.repositoryUrl);
 const runs=await api<{workflow_runs:Array<{id:number;status:string;conclusion:string|null}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs?per_page=50`);
 const completed=runs.workflow_runs.find(x=>x.status==='completed'&&x.conclusion==='success');
 if(!completed)throw new Error('لا يوجد بناء Android ناجح.');
 const artifacts=await api<{artifacts:Array<{name:string;expired:boolean;archive_download_url:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs/${completed.id}/artifacts?per_page=50`);
 const apk=artifacts.artifacts.find(x=>x.name==='bmz-ai-debug-apk'&&!x.expired);
 if(!apk)throw new Error('لا يوجد APK محفوظ في هذا البناء.');
 const archive=raw(await Promise.resolve(apk.archive_download_url));
 const zip=new AdmZip(await archive);
 const entry=zip.getEntries().find((item)=>item.entryName.toLowerCase().endsWith('.apk')&&!item.isDirectory);
 if(!entry)throw new Error('لم تحتوي حزمة GitHub على ملف APK.');
 return entry.getData();
}

export async function downloadLatestArtifactNamed(projectId:string, artifactName:string){
 const project=await getProject(projectId);
 if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بـ GitHub.');
 const {owner,name}=parts(project.repositoryUrl);
 const runs=await api<{workflow_runs:Array<{id:number;status:string;conclusion:string|null}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs?per_page=100`);
 for(const run of runs.workflow_runs.filter(x=>x.status==='completed'&&x.conclusion==='success')){
   const artifacts=await api<{artifacts:Array<{name:string;expired:boolean;archive_download_url:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs/${run.id}/artifacts?per_page=100`);
   const artifact=artifacts.artifacts.find(x=>x.name===artifactName&&!x.expired);
   if(artifact){
     const archive=await raw(artifact.archive_download_url);
     const zip=new AdmZip(archive);
     const entry=zip.getEntries().find((item)=>item.entryName.toLowerCase().endsWith('.apk')&&!item.isDirectory);
     if(!entry)throw new Error(`لم تحتوي حزمة ${artifactName} على APK.`);
     return entry.getData();
   }
 }
 throw new Error(`لا يوجد Artifact ناجح باسم ${artifactName}.`);
}


export async function downloadLatestMobileArtifact(projectId: string) {
  return downloadLatestArtifactNamed(projectId, 'bmz-ai-mobile-debug-apk');
}
