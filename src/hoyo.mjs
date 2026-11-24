import {createHash,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync} from 'node:fs';
import {cleanCookies,cookieCapabilities} from './vault.mjs';
import {parseImport,UserError} from './history.mjs';
import {normalizeDiary,ledgerPeriods} from './savings.mjs';
import {normalizeRoster} from './roster-data.mjs';
const dictionary=JSON.parse(readFileSync(new URL('../exporter/item-dictionary.json',import.meta.url)));
const REGIONS={os_usa:-5,os_euro:1,os_asia:8,os_cht:8};
export class HoyoError extends Error{constructor(code){super('HoYoverse request failed');this.code=String(code).replace(/[^A-Z0-9_-]/g,'').slice(0,40);this.auth=['-100','10001','-101','401','-1071'].includes(this.code);}}
function headers(cookies){const t=Math.floor(Date.now()/1000),r=randomBytes(4).toString('hex').slice(0,6),ds=createHash('md5').update(`salt=6s25p5ox5y14umn1p61aqyyvbvvl3lrt&t=${t}&r=${r}`).digest('hex');return {'User-Agent':'Primogemless/2.0','Referer':'https://www.hoyolab.com/','x-rpc-app_version':'1.5.0','x-rpc-client_type':'5','x-rpc-language':'en-us','x-rpc-lang':'en-us','DS':`${t},${r},${ds}`,...(cookies?{Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')}:{})};}
export class Hoyo {
 constructor({fetcher=fetch,pause=ms=>delay(ms)}={}){this.fetcher=fetcher;this.pause=pause;}
 async request(url,{cookies=null,data=null,params={},signal=null}={}){
  const u=new URL(url);for(const [k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  let response;try{response=await this.fetcher(u,{method:data?'POST':'GET',headers:{...headers(cookies),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});}catch{throw new HoyoError('NETWORK');}
  if(!response.ok)throw new HoyoError(response.status);
  let body;try{body=await response.json();}catch{throw new HoyoError('RESPONSE');}
  if(body.retcode!==0)throw new HoyoError(body.retcode??'RESPONSE');
  return body.data;
 }
 async roles(input,signal=null){const cookies=cleanCookies(input);let data;
  if(cookies.ltoken_v2){data=await this.request('https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie',{cookies,signal,params:{game_biz:'hk4e_global'}});}
  else {
   const list=[];
   for(const region of Object.keys(REGIONS)){const part=await this.request('https://api-account-os.hoyoverse.com/account/binding/api/getUserGameRolesOfRegionByCookieToken',{cookies,signal,params:{game_biz:'hk4e_global',region}});list.push(...(part.list??[]));}
   data={list};
  }
  const roles=(data.list??[]).filter(x=>(!x.game_biz||x.game_biz==='hk4e_global')&&REGIONS[x.region]!==undefined&&/^\d{6,12}$/.test(String(x.game_uid))).map(x=>({uid:String(x.game_uid),region:x.region,timezone:REGIONS[x.region],lang:'en-us'}));
  if(!roles.length)throw new UserError('This login has no supported global Genshin account. Check which HoYoverse account you signed into.');
  return [...new Map(roles.map(x=>[x.uid,x])).values()];
 }
 async authkey(cookies,role){if(!cookieCapabilities(cookies).wishes)throw new UserError('This HoYoLAB-only connection cannot sync wishes. Open Connect and use full manual cookie entry or the Windows helper to enable wish access.');const d=await this.request('https://api-account-os.hoyoverse.com/binding/api/genAuthKeyByCookieToken',{cookies,data:{game_uid:role.uid,region:role.region,game_biz:'hk4e_global',auth_appid:'webview_gacha'}});if(typeof d.authkey!=='string'||d.authkey.length<100)throw new HoyoError('AUTHKEY');return decodeURIComponent(d.authkey);}
 async wishes(cookies,role,known=new Set(),signal=null){
  const authkey=await this.authkey(cookies,role),records=new Map();
  for(const type of ['100','200','301','302','400','500']){
   let end='0',ended=false;
   for(let page=1;page<=2500;page++){
    if(signal?.aborted)throw new HoyoError('CANCELLED');
    const d=await this.request('https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog',{signal,params:{authkey,authkey_ver:1,auth_appid:'webview_gacha',sign_type:2,game_biz:'hk4e_global',region:role.region,lang:'en-us',gacha_type:type,real_gacha_type:type,size:20,page,end_id:end}});
    if(!Array.isArray(d.list))throw new HoyoError('GACHA_RESPONSE');
    if(d.region&&d.region!==role.region)throw new HoyoError('REGION_MISMATCH');
    if(!d.list.length){ended=true;break;}
    for(const r of d.list){if(String(r.uid)!==role.uid)throw new HoyoError('ACCOUNT_MISMATCH');const row={uid:role.uid,id:String(r.id),gacha_type:String(r.gacha_type),rank_type:String(r.rank_type),count:String(r.count),item_id:String(r.item_id||dictionary[r.name]||''),name:r.name,item_type:r.item_type,time:r.time};records.set(row.id,row);}
    if(d.list.every(r=>known.has(String(r.id)))){ended=true;break;}
    const next=String(d.list.at(-1).id);if(next===end)throw new HoyoError('PAGINATION');end=next;
    if(records.size>50000)throw new HoyoError('HISTORY_LIMIT');await this.pause(1250);
   }
   if(!ended)throw new HoyoError('HISTORY_LIMIT');await this.pause(1250);
  }
  if(!records.size)return {accounts:[{...role,list:[]}],inputCount:0};
  return parseImport(Buffer.from(JSON.stringify({info:{version:'v4.2'},hk4e:[{...role,list:[...records.values()]}]})));
 }
 async achievementTotal(cookies,role){const d=await this.request('https://sg-public-api.hoyolab.com/event/game_record/genshin/api/index',{cookies,params:{role_id:role.uid,server:role.region}});return d.stats?.achievement_number;}
 async dailyNotes(cookies,role,signal=null){return this.request('https://sg-public-api.hoyolab.com/event/game_record/genshin/api/dailyNote',{cookies,signal,params:{role_id:role.uid,server:role.region}});}
 async roster(cookies,role,signal=null){const d=await this.request('https://sg-public-api.hoyolab.com/event/game_record/genshin/api/character/list',{cookies,signal,data:{role_id:role.uid,server:role.region}});return normalizeRoster(d,role);}
 async diary(cookies,role,period=ledgerPeriods()[0]){if(!ledgerPeriods().includes(period))throw new UserError('Only recent diary months can be requested. Older saved summaries remain available.');const d=await this.request('https://sg-hk4e-api.hoyolab.com/event/ysledgeros/month_info',{cookies,params:{uid:role.uid,region:role.region,month:Number(period.slice(5)),lang:'en-us'}});return normalizeDiary(d,role.uid,role.region,period);}
 async announcements(){return this.request('https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnContent',{params:{game:'hk4e',game_biz:'hk4e_global',bundle_id:'hk4e_global',platform:'pc',region:'os_asia',uid:900000005,level:8,lang:'en-us'}});}
}
