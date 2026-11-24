import {UserError} from './history.mjs';
import {artwork,itemInfo} from './artwork.mjs';

export const publicUid=value=>{const uid=String(value);if(!/^[1-9]\d{8,9}$/.test(uid))throw new UserError('Choose a valid Genshin UID.');return uid;};
const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const label=id=>{try{return itemInfo(id).name;}catch{return 'Item '+id;}};
const SLOTS={EQUIP_BRACER:'Flower',EQUIP_NECKLACE:'Plume',EQUIP_SHOES:'Sands',EQUIP_RING:'Goblet',EQUIP_DRESS:'Circlet'};
const PROPS={HP:'HP',ATTACK:'ATK',DEFENSE:'DEF',HP_PERCENT:'HP',ATTACK_PERCENT:'ATK',DEFENSE_PERCENT:'DEF',CRITICAL:'CRIT Rate',CRITICAL_HURT:'CRIT DMG',CHARGE_EFFICIENCY:'Energy Recharge',ELEMENT_MASTERY:'Elemental Mastery',HEAL_ADD:'Healing Bonus',PHYSICAL_ADD_HURT:'Physical DMG',FIRE_ADD_HURT:'Pyro DMG',ELEC_ADD_HURT:'Electro DMG',WATER_ADD_HURT:'Hydro DMG',GRASS_ADD_HURT:'Dendro DMG',WIND_ADD_HURT:'Anemo DMG',ROCK_ADD_HURT:'Geo DMG',ICE_ADD_HURT:'Cryo DMG'};
const percent=key=>!['HP','ATTACK','DEFENSE','ELEMENT_MASTERY','BASE_ATTACK'].includes(key);
function stat(raw){const key=String(raw?.mainPropId??raw?.appendPropId??'').replace(/^FIGHT_PROP_/,''),value=number(raw?.statValue??raw?.propValue);return {key,label:PROPS[key]??key.replaceAll('_',' '),value,text:percent(key)?value.toFixed(1)+'%':Math.round(value).toLocaleString('en-US')};}
const fmt=(v,p=false)=>v===undefined?'—':p?(number(v)*100).toFixed(1)+'%':Math.round(number(v)).toLocaleString('en-US');
export function normalizeShowcase(raw,uid){
 publicUid(uid);if(!raw||typeof raw!=='object'||(!raw.playerInfo&&!raw.avatarInfoList))throw new UserError('Enka returned an unavailable profile. Try again later.');
 if(raw.uid!==undefined&&String(raw.uid)!==uid)throw new UserError('The showcase UID did not match your selected account.');
 const builds=(Array.isArray(raw.avatarInfoList)?raw.avatarInfoList:[]).slice(0,20).filter(x=>/^\d{8}$/.test(String(x.avatarId))).map(a=>{
  const id=String(a.avatarId),props=a.fightPropMap??{},equips=Array.isArray(a.equipList)?a.equipList:[],weapon=equips.find(e=>e.weapon),artifacts=Object.entries(SLOTS).map(([slot,name])=>{
   const e=equips.find(e=>e.reliquary&&e.flat?.equipType===slot);if(!e)return {slot:name,missing:true};
   const sub=(e.flat.reliquarySubstats??[]).slice(0,4).map(stat),main=stat(e.flat.reliquaryMainstat);
   const cv=[main,...sub].reduce((sum,s)=>sum+(s.key==='CRITICAL'?s.value*2:s.key==='CRITICAL_HURT'?s.value:0),0);
   return {slot:name,level:Math.max(0,number(e.reliquary.level)-1),rank:number(e.flat.rankLevel),main,sub,cv,icon:/^UI_RelicIcon_[A-Za-z0-9_]+$/.test(e.flat.icon??'')?'/ui/'+e.flat.icon+'.png':null};
  });
  const bonus=[[30,'Physical DMG'],[40,'Pyro DMG'],[41,'Electro DMG'],[42,'Hydro DMG'],[43,'Dendro DMG'],[44,'Anemo DMG'],[45,'Geo DMG'],[46,'Cryo DMG'],[26,'Healing Bonus']].sort((a,b)=>number(props[b[0]])-number(props[a[0]]))[0];
  return {id,name:label(id),rank:String(artwork[id]?.rank??5),level:number(a.propMap?.['4001']?.val??a.propMap?.['4001']?.ival),constellation:Math.min(6,Array.isArray(a.talentIdList)?a.talentIdList.length:0),weapon:weapon?{id:String(weapon.itemId),name:label(weapon.itemId),level:number(weapon.weapon.level),refinement:Math.min(5,Math.max(1,number(Object.values(weapon.weapon.affixMap??{})[0])+1))}:null,artifacts,cv:artifacts.reduce((n,a)=>n+(a.cv??0),0),stats:[['HP',fmt(props[2000])],['ATK',fmt(props[2001])],['DEF',fmt(props[2002])],['Elemental Mastery',fmt(props[28])],['CRIT Rate',fmt(props[20],true)],['CRIT DMG',fmt(props[22],true)],['Energy Recharge',fmt(props[23],true)],[bonus[1],fmt(props[bonus[0]],true)]].map(([label,value])=>({label,value}))};
 });
 return {uid,nickname:String(raw.playerInfo?.nickname??'Traveler').slice(0,36),level:number(raw.playerInfo?.level),profileUnavailable:!!raw.profileUnavailable,builds};
}
export class Enka {
 constructor({fetcher=fetch,now=Date.now}={}){this.fetcher=fetcher;this.now=now;this.cache=new Map();this.pending=new Map();this.backoff=0;}
 async showcase(value){
  const uid=publicUid(value),cached=this.cache.get(uid);if(cached&&cached.expires>this.now()){if(cached.error)throw new UserError(cached.error);return cached.data;}
  if(this.now()<this.backoff)throw new UserError('Enka is busy. Please wait a few minutes, then refresh your builds.');
  if(this.pending.has(uid))return this.pending.get(uid);
  const request=this.load(uid).finally(()=>this.pending.delete(uid));this.pending.set(uid,request);return request;
 }
 remember(uid,entry){this.cache.delete(uid);this.cache.set(uid,entry);while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);}
 async load(uid){
  try{
   const r=await this.fetcher('https://enka.network/api/uid/'+uid+'/',{headers:{'User-Agent':'Primogemless/2.11 (https://t.me/Primogemless_bot)','Accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
   if(r.status===429||r.status===503){const retry=r.headers.get('retry-after'),seconds=/^\d+$/.test(retry??'')?Number(retry):Math.max(0,(Date.parse(retry)-this.now())/1000)||60;this.backoff=this.now()+Math.max(60,seconds)*1000;throw new UserError('Enka is busy. Please wait a few minutes, then refresh your builds.');}
   if(r.status===404)throw new UserError('Enka cannot find a public showcase for this UID yet. Check your in-game profile settings.');
   if(!r.ok)throw new UserError('Enka is temporarily unavailable. You can still open your Akasha profile below.');
   if(number(r.headers.get('content-length'))>2000000)throw new Error('RESPONSE_TOO_LARGE');
   let size=0;const parts=[];for await(const chunk of r.body){size+=chunk.length;if(size>2000000)throw new Error('RESPONSE_TOO_LARGE');parts.push(chunk);}
   const raw=JSON.parse(Buffer.concat(parts).toString('utf8')),data=normalizeShowcase(raw,uid),ttl=Math.max(60,number(raw.ttl,60));
   data.fetchedAt=new Date(this.now()).toISOString();data.refreshAt=new Date(this.now()+ttl*1000).toISOString();
   this.remember(uid,{data,expires:this.now()+ttl*1000});return data;
  }catch(error){const message=error instanceof UserError?error.message:'Enka could not load the showcase. Try again shortly, or open your profile on the website.';this.remember(uid,{error:message,expires:this.now()+60000});throw new UserError(message);}
 }
}
