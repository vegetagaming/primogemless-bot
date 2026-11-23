import {readFileSync} from 'node:fs';
import {stats,sortWishes} from './history.mjs';
export const patchData=JSON.parse(readFileSync(new URL('../assets/patches.json',import.meta.url)));
export function loadSchedule(store){try{const saved=JSON.parse(store.getMeta('patch_schedule_v1'));if(Array.isArray(saved.patches)&&saved.patches.length<200&&Number.isFinite(Date.parse(saved.verifiedThrough))){patchData.patches=saved.patches;patchData.verifiedThrough=saved.verifiedThrough;}}catch{}}
export function parseAnnouncements(data,now=Date.now()){
 const result=[];
 for(const a of data.list??[]){
  if(!/Update (?:Maintenance Preview|Details)/i.test(a.title??''))continue;
  const version=a.title.match(/Version\s+["“]?([0-9]+\.[0-9]+|Luna\s+[IVX]+)/i)?.[1];if(!version)continue;
  const text=String(a.content??'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  const m=text.match(/(?:maintenance begins|begin update maintenance on)\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/i);if(!m)continue;
  const start=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);if(!Number.isFinite(+start)||+start>now+90*86400000||+start<Date.parse('2020-01-01'))continue;
  const roman={I:0,II:1,III:2,IV:3,V:4,VI:5,VII:6,VIII:7};
  const id=version.startsWith('Luna')?`6.${roman[version.split(/\s+/)[1]]}`:version;if(!/^\d{1,2}\.\d{1,2}$/.test(id))continue;
  result.push({id,label:version.startsWith('Luna')?`${version} · ${id}`:`Version ${id}`,start:start.toISOString(),source:'https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnContent',announcementId:a.ann_id});
 }
 return result;
}
export async function refreshSchedule(store,hoyo){
 if(Number(store.getMeta('patch_next_check')??0)>Date.now())return;
 try{
  const list=parseAnnouncements(await hoyo.announcements());
  if(list.length){const merged=new Map(patchData.patches.map(p=>[p.id,p]));for(const p of list)merged.set(p.id,p);patchData.patches=[...merged.values()].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));patchData.verifiedThrough=new Date(Date.now()+86400000).toISOString();store.setMeta('patch_schedule_v1',JSON.stringify(patchData));}
  store.setMeta('patch_next_check',Date.now()+21600000);
 }catch{store.setMeta('patch_next_check',Date.now()+3600000);}
}
export function wishTime(time,timezone){return Date.parse(time.replace(' ','T')+'Z')-timezone*3600000;}
export function patchFor(row,timezone,data=patchData){
 const t=wishTime(row.time,timezone);
 if(t>Date.parse(data.verifiedThrough))return {id:'unmapped',label:'Dates awaiting a patch update'};
 return [...data.patches].reverse().find(p=>t>=Date.parse(p.start))??{id:'older',label:'Earlier archive'};
}
export function patchGroups(rows,timezone){
 const groups=new Map();
 for(const row of sortWishes(rows,true)){
  const p=patchFor(row,timezone);
  if(!groups.has(p.id))groups.set(p.id,{...p,rows:[]});
  groups.get(p.id).rows.push(row);
 }
 return [...groups.values()].map(g=>({...g,total:g.rows.length,five:g.rows.filter(r=>r.rank_type==='5').length,four:g.rows.filter(r=>r.rank_type==='4').length,banners:stats(g.rows)}));
}
