import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const sessions=new Map<string,{browser:Browser;context:BrowserContext;page:Page;allowed:string[];createdAt:string}>();
function key(userId:string,sessionId:string){return userId+':'+sessionId;}
function allowedUrl(raw:string,allowed:string[]){const u=new URL(raw);if(u.protocol!=='https:')throw new Error('Browser يسمح فقط بـ HTTPS.');if(!allowed.length)throw new Error('لم يتم تحديد نطاقات Browser المسموحة.');if(!allowed.some(x=>u.hostname===x||u.hostname.endsWith('.'+x)))throw new Error('النطاق غير مسموح به.');return u;}
function get(userId:string,sessionId:string){const s=sessions.get(key(userId,sessionId));if(!s)throw new Error('جلسة Browser غير موجودة.');return s;}
function assertCurrentOrigin(s:{page:Page;allowed:string[]}){const u=new URL(s.page.url());if(u.protocol!=='https:'||!s.allowed.some(x=>u.hostname===x||u.hostname.endsWith('.'+x)))throw new Error('الصفحة الحالية خرجت عن نطاق Browser المسموح.');}

export async function browserOpen(userId:string,sessionId:string,url:string,allowed:string[]){
  const target=allowedUrl(url,allowed);const k=key(userId,sessionId);let s=sessions.get(k);
  if(!s){const browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();s={browser,context,page,allowed,createdAt:new Date().toISOString()};sessions.set(k,s);}
  s.allowed=allowed;await s.page.goto(target.toString(),{waitUntil:'domcontentloaded',timeout:30000});assertCurrentOrigin(s);
  return {sessionId,url:s.page.url(),title:await s.page.title()};
}
export async function browserRead(userId:string,sessionId:string){const s=get(userId,sessionId);assertCurrentOrigin(s);return {url:s.page.url(),title:await s.page.title(),text:(await s.page.locator('body').innerText()).slice(0,100000)};}
export async function browserClick(userId:string,sessionId:string,selector:string){const s=get(userId,sessionId);assertCurrentOrigin(s);await s.page.locator(selector).first().click({timeout:15000});assertCurrentOrigin(s);return {url:s.page.url()};}
export async function browserFill(userId:string,sessionId:string,selector:string,value:string){const s=get(userId,sessionId);assertCurrentOrigin(s);await s.page.locator(selector).first().fill(value,{timeout:15000});return {ok:true};}
export async function browserClose(userId:string,sessionId:string){const k=key(userId,sessionId);const s=sessions.get(k);if(!s)return false;await s.browser.close();sessions.delete(k);return true;}
