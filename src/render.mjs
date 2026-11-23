import {Resvg} from '@resvg/resvg-js';
import {createHash} from 'node:crypto';
import {artwork,itemId} from './artwork.mjs';
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colors={Grass:'#a5d86f',Wind:'#72dcca',Fire:'#f4a086',Water:'#7cbaf5',Ice:'#a0dfe9',Electric:'#bd9af2',Rock:'#e9c989'};
const element={Grass:'DENDRO',Wind:'ANEMO',Fire:'PYRO',Water:'HYDRO',Ice:'CRYO',Electric:'ELECTRO',Rock:'GEO'};
export function pityColor(rank,value){
 if(String(rank)==='4')return '#c3a2f3';
 const count=Number.parseInt(String(value),10);
 if(String(rank)!=='5'||!Number.isFinite(count)||count<1)return '#f0ede5';
 return count<=35?'#76dba1':count<=65?'#f3d275':'#ff858a';
}
const t=(x,y,size,text,fill='#edf0f5',weight=400,extra='')=>`<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(text)}</text>`;
const rect=(x,y,w,h,r,fill,stroke='none')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const image=(a,x,y,w,h,fit='xMidYMid meet',extra='')=>a?`<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}" href="data:${a.mime};base64,${a.bytes.toString('base64')}" ${extra}/>`:'';
function star(x,y,s,color='#e5c78d'){return `<path d="M${x} ${y-s} L${x+s*.25} ${y-s*.25} L${x+s} ${y} L${x+s*.25} ${y+s*.25} L${x} ${y+s} L${x-s*.25} ${y+s*.25} L${x-s} ${y} L${x-s*.25} ${y-s*.25} Z" fill="${color}"/>`;}
function shell(height,content,accent='#e5c78d'){
 const stars=Array.from({length:35},(_,i)=>{const x=40+(i*173)%1130,y=35+(i*97)%(height-70);return `<circle cx="${x}" cy="${y}" r="${i%5===0?2:1}" fill="#b6c7e0" opacity="${i%3===0?.4:.15}"/>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#172438"/><stop offset="1" stop-color="#080f1c"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".19"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><linearGradient id="shade"><stop stop-color="#0d1829" stop-opacity="1"/><stop offset=".7" stop-color="#0d1829" stop-opacity=".92"/><stop offset="1" stop-color="#0d1829" stop-opacity="0"/></linearGradient><clipPath id="outer"><rect width="1200" height="${height}" rx="30"/></clipPath></defs><g clip-path="url(#outer)">${rect(0,0,1200,height,30,'url(#bg)')}<ellipse cx="935" cy="${height/2}" rx="550" ry="420" fill="url(#glow)"/>${stars}${rect(18,18,1164,height-36,21,'none','#354355')}${content}</g></svg>`;
}
function header(label,right='WISH ARCHIVE') {return star(50,48,10)+t(72,55,18,'PRIMOGEMLESS','#ddc99f',600,'letter-spacing="3"')+t(1146,55,14,right,'#8e9db3',500,'text-anchor="end" letter-spacing="2"')+t(48,118,39,label,'#edf0f5',600);}
function metric(x,y,value,label,width=180,color='#e7cc98') {const size=Math.min(36,Math.floor((width-46)/Math.max(1,String(value).length)*1.7));return rect(x,y,width,104,18,'#182638','#334156')+t(x+23,y+46,size,value,color,600)+t(x+23,y+78,14,label,'#98a8bc',500,'letter-spacing="1"');}
export class CardRenderer{
 constructor(art){this.art=art;}
 async render(model){
  const svg=await this.svg(model),key=createHash('sha256').update('ui-v3.1').update(svg).digest('hex');
  return {key,svg,png:()=>Buffer.from(new Resvg(svg,{font:{loadSystemFonts:true,defaultFontFamily:process.platform==='win32'?'Segoe UI':'DejaVu Sans'}}).render().asPng())};
 }
 async svg(m){
  if(m.type==='hit')return this.hit(m);
  if(m.type==='grid'||m.type==='ownedgrid')return this.grid(m);
  if(m.type==='ownedDetail')return this.ownedDetail(m);
  if(m.type==='artpreview')return this.artPreview(m);
  return this.dashboard(m);
 }
 async artPreview(m){const a=await this.art.source(m.id),meta=artwork[m.id]??{},accent=colors[meta.element]??'#e5c78d';return shell(650,image(a,310,-5,1000,660,a?.custom?'xMidYMid slice':'xMidYMid meet')+rect(0,0,630,650,0,'url(#shade)')+star(49,48,10)+t(72,55,17,'ARTWORK STUDIO','#ddc99f',600,'letter-spacing="3"')+t(48,210,m.name.length>21?34:48,m.name,'#f3f0e7',600)+t(48,252,19,a?.custom?'Your custom artwork':'Official character artwork','#9cabc0')+t(48,540,17,'One image. Every wish card.','#cbd5e3')+t(48,574,15,'Only the bot owner can change this image.','#8fa1b8'),accent);}
 async hit(m){
  const r=m.row,id=itemId(r),a=artwork[id]??{},accent=colors[a.element]??(r.rank_type==='5'?'#e5c78d':'#c0a4ef'),art=await this.art.source(id);
  const pity=String(r.pity.count)+(r.pity.anchored?'':'+');
  let body=image(art,410,-14,900,690,art?.custom?'xMidYMid slice':'xMidYMid meet');
  body+=rect(0,0,670,650,0,'url(#shade)')+star(49,48,10)+t(72,55,17,'PRIMOGEMLESS','#ddc99f',600,'letter-spacing="3"');
  body+=rect(48,91,160,32,16,'#253442')+t(128,113,12,(element[a.element]??(a.kind==='weapon'?'WEAPON':'CHARACTER'))+' / '+r.rank_type+' STAR',accent,600,'text-anchor="middle" letter-spacing="1"');
  const size=r.name.length>25?34:r.name.length>18?41:54;
  body+=t(46,183,size,r.name,'#f3f0e7',600)+t(48,218,19,m.patch,'#9cabc0');
  body+=t(48,274,13,'PITY AT THIS WISH',accent,600,'letter-spacing="3"')+t(42,378,110,pity,pityColor(r.rank_type,r.pity.count),600);
  body+=t(51,410,16,r.pity.anchored?'pulls since the previous '+r.rank_type+'-star':'earlier history is missing','#97a8be');
  body+=metric(48,451,r.rank_type+' STAR','RARITY',177,accent)+metric(237,451,String(m.copies),'SAVED COPIES',177,accent);
  body+=t(48,591,18,m.banner,'#d3dbe5',500)+t(48,617,14,r.time+'  /  SERVER TIME','#8495ad');
  body+=t(1150,617,12,'WISH '+(m.index+1)+' / '+m.total+'   ·   '+(art?.custom?'CUSTOM ART':'HOYOVERSE / ENKA'),'#bcc5d2',400,'text-anchor="end"');
  return shell(650,body,accent);
 }
 async dashboard(m){
  let body=header(m.title,m.eyebrow??'YOUR JOURNEY, REMEMBERED');
  body+=t(49,153,18,m.subtitle??'','#95a6bd');
  (m.metrics??[]).slice(0,4).forEach((v,i)=>{body+=metric(48+i*277,190,String(v.value),v.label,258,v.color);});
  body+=`<path d="M54 349 L281 326 L471 366 L703 329 L919 365 L1139 332" fill="none" stroke="#52627a" stroke-opacity=".5"/>`;
  [54,281,471,703,919,1139].forEach((x,i)=>body+=star(x,[349,326,366,329,365,332][i],i%2?5:8,'#b5a178'));
  body+=t(49,414,16,m.footer??'A little luck. A lasting memory.','#a8b4c5')+t(1150,414,13,m.uid?'UID '+m.uid:'PRIMOGEMLESS','#72839b',400,'text-anchor="end"');
  return shell(450,body,m.accent);
 }
 async ownedDetail(m){
  const art=await this.art.source(m.id),meta=artwork[m.id]??{},accent=colors[meta.element]??(m.rank==='4'?'#c3a2f3':'#e5c78d');
  let body=image(art,410,-14,900,690,art?.custom?'xMidYMid slice':'xMidYMid meet')+rect(0,0,670,650,0,'url(#shade)');
  body+=star(49,48,10)+t(72,55,17,'PRIMOGEMLESS','#ddc99f',600,'letter-spacing="3"')+t(48,112,15,m.title,accent,600,'letter-spacing="2"');
  body+=t(46,183,m.name.length>25?29:m.name.length>18?39:51,m.name.length>33?m.name.slice(0,32)+'…':m.name,'#f3f0e7',600)+t(48,218,18,(m.subtitle??'').slice(0,45),'#9cabc0');
  body+=t(48,274,13,m.badgeLabel,accent,600,'letter-spacing="3"')+t(42,391,116,m.badge,accent,600);
  (m.metrics??[]).slice(0,2).forEach((v,i)=>body+=metric(48+i*198,451,String(v.value),v.label,186,accent));
  body+=t(48,606,15,m.footer,'#a2b0c3');return shell(650,body,accent);
 }
 async grid(m){
  const owned=m.type==='ownedgrid';
  const rows=Math.max(1,Math.ceil(m.items.length/3)),height=226+rows*182;
  let body=header(m.title,m.kind==='w'?'WEAPON COLLECTION':'CHARACTER COLLECTION')+t(49,153,18,m.subtitle,'#95a6bd');
  const assets=await Promise.all(m.items.map(x=>this.art.source(x.id,true)));
  m.items.forEach((entry,i)=>{
   const x=48+(i%3)*373,y=182+Math.floor(i/3)*182,accent=entry.rank==='5'?'#e4c383':'#b7a0e4';
   body+=rect(x,y,358,166,18,'#172537','#34435a');
   body+=`<path d="M${x+17} ${y+1} H${x+341}" stroke="${accent}" stroke-width="2" opacity=".8"/>`;
   body+=image(assets[i],x+3,y+20,130,142);
   body+=t(x+139,y+48,entry.name.length>18?15:19,entry.name.length>25?entry.name.slice(0,24)+'…':entry.name,'#edf0f5',600);
   body+=t(x+139,y+77,13,owned?entry.secondary:entry.rank+' STAR  /  ×'+entry.copies,accent,600);
   body+=owned?t(x+139,y+117,35,entry.badge,accent,600)+t(x+139,y+141,12,entry.detail,'#8798ae',500):t(x+139,y+115,29,entry.pity,pityColor(entry.rank,entry.pity),600)+t(x+146+String(entry.pity).length*17,y+115,29,'pity','#f0ede5',600)+t(x+139,y+141,12,'LATEST SAVED PULL','#8798ae',500);
  });
  if(!m.items.length)body+=t(600,245,23,m.empty??'No saved wishes in this selection.','#9aaac0',400,'text-anchor="middle"');
  body+=t(48,height-22,13,owned?'Choose a name below for details.':'Choose a name below to open its wish card.','#8a9bb3')+t(1150,height-22,13,'PAGE '+(m.page+1)+' / '+m.pages,'#8a9bb3',400,'text-anchor="end"');
  return shell(height,body);
 }
}
