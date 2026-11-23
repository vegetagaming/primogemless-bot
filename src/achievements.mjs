import {readFileSync} from 'node:fs';
import {UserError,MAX_UPLOAD_BYTES,hasSecret} from './history.mjs';
export const catalogue=JSON.parse(readFileSync(new URL('../assets/achievements.json',import.meta.url)));
export const achievementById=new Map(catalogue.items.map(a=>[a.id,a]));
export function parseUIAF(buffer){
 if(buffer.length>MAX_UPLOAD_BYTES)throw new UserError('The achievement file exceeds 10 MB.');
 const raw=buffer.toString('utf8').replace(/^\uFEFF/,'');
 if(hasSecret(raw))throw new UserError('Upload clean achievement data, without cookies or links.');
 let doc;try{doc=JSON.parse(raw);}catch{throw new UserError('This is not valid JSON.');}
 if(!['v1.0','v1.1'].includes(doc?.info?.uiaf_version)||!Array.isArray(doc.list)||doc.list.length>10000)throw new UserError('Use a UIAF v1.0 or v1.1 achievement export.');
 const rows=new Map();
 for(const a of doc.list){
  if(!a||!Number.isSafeInteger(a.id)||a.id<=0||!Number.isSafeInteger(a.current)||a.current<0||!Number.isSafeInteger(a.timestamp)||a.timestamp<0||a.timestamp>253402271999)throw new UserError('An achievement record is invalid. Nothing was imported.');
  const status=doc.info.uiaf_version==='v1.0'?3:a.status;
  if(![0,1,2,3].includes(status))throw new UserError('Invalid achievement completion status.');
  const clean={id:a.id,current:a.current,status,timestamp:a.timestamp};
  if(rows.has(a.id)&&JSON.stringify(rows.get(a.id))!==JSON.stringify(clean))throw new UserError('Conflicting achievement records in one file.');
  rows.set(a.id,clean);
 }
 return [...rows.values()];
}
export function exportUIAF(rows){return {info:{export_app:'Primogemless',export_app_version:'2.0.0',uiaf_version:'v1.1',export_timestamp:Math.floor(Date.now()/1000)},list:rows.map(({id,current,status,timestamp})=>({id,current,status,timestamp}))};}
