import { getProject } from './project-store.js';

function parts(url:string){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='github.com')throw new Error('رابط GitHub غير صالح.');const p=u.pathname.split('/').filter(Boolean);return {owner:p[0],name:p[1].replace(/\.git$/i,'')};}
async function api<T>(url:string):Promise<T>{if(!process.env.GITHUB_TOKEN)throw new Error('GITHUB_TOKEN غير مضبوط.');const r=await fetch(url,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'BMZ-AI'}});if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);return r.json() as Promise<T>;}
export async function latestAndroidBuild(projectId:string){
 const project=await getProject(projectId);if(!project?.repositoryUrl)throw new Error('المشروع غير مرتبط بـ GitHub.');
 const {owner,name}=parts(project.repositoryUrl);
 const runs=await api<{workflow_runs:Array<{id:number;status:string;conclusion:string|null;html_url:string;head_sha:string;created_at:string;updated_at:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs?per_page=20`);
 const run=runs.workflow_runs.find(x=>x.status==='in_progress'||x.status==='queued')??runs.workflow_runs.find(x=>x.conclusion==='success'||x.conclusion==='failure');
 if(!run)return {found:false};
 const artifacts=await api<{artifacts:Array<{id:number;name:string;expired:boolean;size_in_bytes:number;archive_download_url:string}>}>(`https://api.github.com/repos/${owner}/${name}/actions/runs/${run.id}/artifacts`);
 const apk=artifacts.artifacts.find(x=>x.name==='bmz-ai-debug-apk'&&!x.expired);
 return {found:true,run:{id:run.id,status:run.status,conclusion:run.conclusion,htmlUrl:run.html_url,headSha:run.head_sha,updatedAt:run.updated_at},artifact:apk?{id:apk.id,name:apk.name,size:apk.size_in_bytes,downloadUrl:apk.archive_download_url}:null};
}
