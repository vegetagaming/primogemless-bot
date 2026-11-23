import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {UserError} from './history.mjs';
export const artwork=JSON.parse(readFileSync(new URL('../assets/enka-icons.json',import.meta.url))).items;
const dictionary=JSON.parse(readFileSync(new URL('../exporter/item-dictionary.json',import.meta.url)));
const names=new Map(Object.entries(dictionary).map(([name,id])=>[String(id),name]));
export const itemId=row=>String(row.item_id||dictionary[row.name]||'');
export const items=Object.entries(artwork).map(([id,a])=>({id,name:names.get(id)??id,...a})).sort((a,b)=>a.name.localeCompare(b.name));
export function itemInfo(id){const a=artwork[String(id)];if(!a)throw new UserError('That item is not in the artwork catalogue.');return {id:String(id),name:names.get(String(id))??String(id),...a};}
export function imageInfo(bytes){
 let width,height,mime;
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);mime='image/png';}
 else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216){
  let p=2;while(p+4<=bytes.length){if(bytes[p++]!==255)continue;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;if(marker===0||marker===255||marker>=0xd0&&marker<=0xd7)continue;const size=bytes.readUInt16BE(p);if(size<2||p+size>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){height=bytes.readUInt16BE(p+3);width=bytes.readUInt16BE(p+5);mime='image/jpeg';break;}p+=size;}
 }
 if(!mime||!width||!height||width>6000||height>6000||width*height>18000000||bytes.length>10*1024*1024)throw new UserError('Use a PNG or JPEG image under 10 MB and 18 megapixels.');
 return {mime,width,height};
}
export class Artwork{
 constructor(store,directory,{fetcher=fetch}={}){this.store=store;this.directory=directory;this.fetcher=fetcher;this.pending=new Map();mkdirSync(directory,{recursive:true});}
 override(id){try{return JSON.parse(this.store.getMeta('art_override:'+id)??'null');}catch{return null;}}
 emoji(id){try{return JSON.parse(this.store.getMeta('item_emoji:'+id)??'null');}catch{return null;}}
 setEmoji(id,value){itemInfo(id);this.store.setMeta('item_emoji:'+id,JSON.stringify(value));}
 save(id,bytes){itemInfo(id);const info=imageInfo(bytes),hash=createHash('sha256').update(bytes).digest('hex');writeFileSync(join(this.directory,hash+'.img'),bytes);this.store.setMeta('art_override:'+id,JSON.stringify({hash,...info}));return info;}
 reset(id){itemInfo(id);this.store.setMeta('art_override:'+id,'null');}
 async source(id,portrait=false){
  const a=artwork[id];if(!a)return null;
  const override=!portrait&&this.override(id);
  if(override&&/^[a-f0-9]{64}$/.test(override.hash)){try{const bytes=readFileSync(join(this.directory,override.hash+'.img'));return {bytes,mime:imageInfo(bytes).mime,custom:true};}catch{}}
  const splash=a.kind==='character'?a.icon.replace('UI_AvatarIcon_','UI_Gacha_AvatarImg_'):a.icon;
  for(const path of [...new Set([portrait?a.icon:splash,a.icon])]){
   try{const bytes=await this.fetchAsset(path);return {bytes,mime:imageInfo(bytes).mime,custom:false};}catch{}
  }
  return null;
 }
 async fetchAsset(path){
  if(!/^\/ui\/[A-Za-z0-9_]+\.png$/.test(path))throw new Error('Invalid asset path');
  const hash=createHash('sha256').update(path).digest('hex'),file=join(this.directory,hash+'.img');
  if(existsSync(file))return readFileSync(file);
  if(this.pending.has(path))return this.pending.get(path);
  const task=(async()=>{
   const r=await this.fetcher('https://enka.network'+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok||!r.body)throw new Error('Artwork unavailable');
   let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>10*1024*1024)throw new Error('Artwork too large');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);imageInfo(bytes);writeFileSync(file,bytes);return bytes;
  })();this.pending.set(path,task);try{return await task;}finally{this.pending.delete(path);}
 }
}
