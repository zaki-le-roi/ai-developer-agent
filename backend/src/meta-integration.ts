import { getSecret, putSecret } from './secret-store.js';

const graphVersion=process.env.META_GRAPH_VERSION?.trim()||'v23.0';
const graphBase=process.env.META_GRAPH_BASE_URL?.trim()||'https://graph.facebook.com';

async function graph(path:string,init:RequestInit={}){
  const response=await fetch(`${graphBase}/${graphVersion}/${path}`,init);
  const body=await response.text();
  let data:unknown; try{data=JSON.parse(body)}catch{data={raw:body}}
  if(!response.ok)throw new Error(`Meta Graph HTTP ${response.status}: ${body.slice(0,500)}`);
  return data as Record<string,unknown>;
}

export async function connectMeta(userId:string,input:{pageAccessToken?:string;whatsappAccessToken?:string;whatsappPhoneNumberId?:string;verifyToken?:string}){
  if(input.pageAccessToken)await putSecret(userId,'meta_page_access_token',input.pageAccessToken);
  if(input.whatsappAccessToken)await putSecret(userId,'meta_whatsapp_access_token',input.whatsappAccessToken);
  if(input.whatsappPhoneNumberId)await putSecret(userId,'meta_whatsapp_phone_id',input.whatsappPhoneNumberId);
  if(input.verifyToken)await putSecret(userId,'meta_verify_token',input.verifyToken);
  return {facebookPage:Boolean(input.pageAccessToken||getSecret(userId,'meta_page_access_token')),whatsapp:Boolean((input.whatsappAccessToken||getSecret(userId,'meta_whatsapp_access_token'))&&(input.whatsappPhoneNumberId||getSecret(userId,'meta_whatsapp_phone_id')))};
}

export function metaWebhookChallenge(userId:string,mode:string,token:string,challenge:string){
  const verify=getSecret(userId,'meta_verify_token');
  if(mode==='subscribe'&&verify&&token===verify)return challenge;
  return null;
}

export async function sendFacebookPageMessage(userId:string,recipientId:string,text:string){
  const token=getSecret(userId,'meta_page_access_token');
  if(!token)throw new Error('لم يتم ربط Facebook Page لهذا المستخدم.');
  return graph('me/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:recipientId},message:{text},access_token:token})});
}

export async function sendWhatsAppMessage(userId:string,to:string,text:string){
  const token=getSecret(userId,'meta_whatsapp_access_token');
  const phoneId=getSecret(userId,'meta_whatsapp_phone_id');
  if(!token||!phoneId)throw new Error('لم يتم ربط WhatsApp Cloud API لهذا المستخدم.');
  return graph(`${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})});
}
