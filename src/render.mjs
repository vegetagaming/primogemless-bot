import {Resvg} from '@resvg/resvg-js';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {artwork,itemId} from './artwork.mjs';
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cardFont=process.platform==='win32'?'Segoe UI':'DejaVu Sans';
const fontOptions={loadSystemFonts:true,defaultFontFamily:cardFont,sansSerifFamily:cardFont,...(process.platform==='linux'?{fontFiles:['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].filter(existsSync)}:{})};
let fontReady=false;
export function assertCardFont(options=fontOptions){
 const probe='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="2" y="30" font-family="'+esc(options.defaultFontFamily)+'" font-size="26">0123456789</text></svg>';
 const pixels=new Resvg(probe,{font:options}).render().pixels;
 for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)return;
 throw new Error('CARD_FONT_UNAVAILABLE');
}
const colors={Grass:'#a5d86f',Wind:'#72dcca',Fire:'#f4a086',Water:'#7cbaf5',Ice:'#a0dfe9',Electric:'#bd9af2',Rock:'#e9c989'};
const element={Grass:'DENDRO',Wind:'ANEMO',Fire:'PYRO',Water:'HYDRO',Ice:'CRYO',Electric:'ELECTRO',Rock:'GEO'};
const currencyArt=Object.fromEntries(['primogems','crystals','acquaint','intertwined'].map(key=>[key,{mime:'image/png',bytes:readFileSync(new URL('../assets/currencies/'+key+'.png',import.meta.url))}]));
export function pityColor(rank,value){
 if(String(rank)==='4')return '#c3a2f3';
 const count=Number.parseInt(String(value),10);
 if(String(rank)!=='5'||!Number.isFinite(count)||count<1)return '#f0ede5';
 return count<=35?'#76dba1':count<=65?'#f3d275':'#ff858a';
}
const t=(x,y,size,text,fill='#edf0f5',weight=400,extra='')=>`<text x="${x}" y="${y}" font-family="${cardFont}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(text)}</text>`;
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
  if(!fontReady){assertCardFont();fontReady=true;}
  const svg=await this.svg(model),key=createHash('sha256').update('ui-v3.2-fonts').update(svg).digest('hex');
  return {key,svg,png:()=>Buffer.from(new Resvg(svg,{font:fontOptions}).render().asPng())};
 }
 async svg(m){
  if(m.type==='hit')return this.hit(m);
  if(m.type==='grid'||m.type==='ownedgrid')return this.grid(m);
  if(m.type==='ownedDetail')return this.ownedDetail(m);
  if(m.type==='artpreview')return this.artPreview(m);
  if(m.type==='showcase')return this.showcase(m);
  if(m.type==='balance')return this.balance(m);
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
 async balance(m){
  const palettes={primogems:'#a4dfff',crystals:'#b9b0ff',acquaint:'#8bbafa',intertwined:'#efb8e3'};
  const notes={primogems:'160 Primogems = 1 wish',crystals:'Top-up currency',acquaint:'Standard wishes',intertwined:'Event wishes'};
  let body=header('Your balance, in view.','MY GAME PROFILE')+t(49,153,18,m.subtitle,'#95a6bd');
  m.metrics.slice(0,4).forEach((v,i)=>{
   const x=48+(i%2)*564,y=184+Math.floor(i/2)*174,accent=palettes[v.key],value=String(v.value),size=Math.min(53,Math.floor(350/Math.max(value.length,1)*1.65));
   body+=rect(x,y,540,154,19,'#172638','#34475b')+rect(x+18,y+22,4,110,2,accent);
   body+=`<circle cx="${x+84}" cy="${y+75}" r="53" fill="${accent}" opacity=".08"/>`+image(currencyArt[v.key],x+31,y+24,106,106);
   body+=t(x+158,y+39,19,v.label,accent,500)+t(x+155,y+101,size,value,'#f2f4f8',600)+t(x+158,y+132,14,notes[v.key],'#91a6bf');
  });
  body+=rect(48,532,1104,108,19,'#19263c','#40516d');
  body+='<circle cx="104" cy="585" r="28" fill="#cbd6ff"/><circle cx="117" cy="574" r="25" fill="#19263c"/>'+star(137,600,6,'#e8d8a6')+star(83,555,4,'#cbd6ff');
  body+=t(161,574,25,'Blessing of the Welkin Moon','#d9def5',600)+t(161,608,17,m.welkinDays===null?'Set your remaining days in the buttons below.':'Automatically decreases by 1 day every 24 hours.','#9eafc9');
  body+=t(1085,585,44,m.welkinDays===null?'—':String(m.welkinDays),'#e5d5a6',600,'text-anchor="end"')+t(1085,613,12,m.welkinDays===null?'NOT SET':'DAYS LEFT','#a7b7ce',500,'text-anchor="end" letter-spacing="2"');
  body+=t(49,685,16,m.footer,'#a8b4c5')+t(1150,685,14,'UID '+m.uid,'#8296af',500,'text-anchor="end"');
  return shell(720,body,'#a8baf1');
 }
 async showcase(m){
  const [art,artifactImages]=await Promise.all([this.art?.source(m.id),Promise.all(m.artifacts.map(async a=>{try{return a.icon&&this.art?.fetchAsset?{bytes:await this.art.fetchAsset(a.icon),mime:'image/png'}:null;}catch{return null;}}))]),accent=colors[artwork[m.id]?.element]??'#a5d8c5';
  let body=image(art,555,60,670,485,art?.custom?'xMidYMid slice':'xMidYMid meet')+rect(0,80,685,450,0,'url(#shade)');
  body+=header(m.name+'  ·  C'+m.constellation,'PUBLIC SHOWCASE');
  body+=t(49,153,17,m.nickname+'  /  Lv. '+m.level+'  /  UID '+m.uid,'#a6b5ca');
  const weapon=m.weapon?m.weapon.name+'  ·  R'+m.weapon.refinement+'  ·  Lv. '+m.weapon.level:'No weapon equipped';
  body+=t(49,192,20,weapon.length>49?weapon.slice(0,48)+'…':weapon,accent,500);
  m.stats.forEach((s,i)=>{const x=48+(i%2)*270,y=218+Math.floor(i/2)*69;body+=rect(x,y,254,59,12,'#172638','#2f4253')+t(x+15,y+22,13,s.label,'#9dafc5')+t(x+238,y+45,23,s.value,'#edf0f5',600,'text-anchor="end"');});
  body+=rect(817,442,334,69,15,'#122334','#3e5c61')+t(839,469,13,'ARTIFACT CRIT VALUE',accent,600,'letter-spacing="1"')+t(1129,494,28,m.cv.toFixed(1),'#e3d3a3',600,'text-anchor="end"');
  body+=t(49,539,14,'EQUIPPED ARTIFACTS','#bdcbdc',600,'letter-spacing="2"');
  for(let i=0;i<m.artifacts.length;i++){
   const a=m.artifacts[i],x=48+i*224,y=557;body+=rect(x,y,210,270,16,'#172638','#344759')+t(x+15,y+28,17,a.slot,accent,600);
   if(a.missing){body+=t(x+15,y+94,16,'Not equipped','#9dafc5');continue;}
   const icon=artifactImages[i];
   body+=t(x+193,y+28,13,'+'+a.level,'#c4cbd5',500,'text-anchor="end"')+image(icon,x+7,y+33,68,68);
   const mainLabel=a.main.label.replace('Energy Recharge','ER').replace('Elemental Mastery','EM');
   body+=t(x+195,y+57,13,mainLabel,'#9dafc5',500,'text-anchor="end"')+t(x+195,y+84,21,a.main.text,'#edf0f5',600,'text-anchor="end"');
   a.sub.forEach((s,j)=>{const label=s.label.replace('Energy Recharge','ER').replace('Elemental Mastery','EM');body+=t(x+15,y+124+j*27,13,label,'#aab9cd')+t(x+195,y+124+j*27,15,s.text,s.key.startsWith('CRITICAL')?'#dfcf9f':'#edf0f5',500,'text-anchor="end"');});
   body+=t(x+15,y+249,13,'CV','#9dafc5')+t(x+195,y+249,18,a.cv.toFixed(1),'#dfcf9f',600,'text-anchor="end"');
  }
  body+=t(49,859,14,'Artifact CV includes main stats + substats. Rankings are on Akasha.','#9dafc5')+t(1150,859,13,'HOYOVERSE / ENKA.NETWORK','#8396ae',500,'text-anchor="end"');
  return shell(890,body,accent);
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
  if(m.kind==='c')return this.characterGrid(m);
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
 async characterGrid(m){
  const owned=m.type==='ownedgrid',rows=Math.max(4,Math.ceil(m.items.length/3)),height=230+rows*278;
  let body=header(m.title,owned?'OWNED CHARACTERS':'PULLED CHARACTERS')+t(49,153,18,m.subtitle,'#95a6bd');
  const assets=await Promise.all(m.items.map(x=>this.art?.source(x.id,true)));
  m.items.forEach((entry,i)=>{
   const x=48+(i%3)*373,y=182+Math.floor(i/3)*278,accent=entry.rank==='5'?'#e4c383':'#b7a0e4',meta=artwork[entry.id]??{},elementColor=colors[meta.element]??accent;
   body+=rect(x,y,358,260,19,'#172537','#34435a')+rect(x+1,y+1,356,166,18,'#213247');
   body+=`<circle cx="${x+179}" cy="${y+86}" r="76" fill="${elementColor}" opacity=".12"/>`+image(assets[i],x+94,y+2,170,170);
   body+=rect(x+14,y+14,62,29,14,'#111d2f')+t(x+45,y+35,17,entry.rank+'★','#c3a2f3',600,'text-anchor="middle"');
   body+=rect(x+274,y+14,70,32,14,'#111d2f')+t(x+309,y+37,20,owned?entry.badge:'×'+entry.copies,accent,600,'text-anchor="middle"');
   const name=entry.name.length>29?entry.name.slice(0,28)+'…':entry.name,size=entry.name.length>22?19:entry.name.length>17?22:26;
   body+=t(x+179,y+202,size,name,'#f0f3f8',600,'text-anchor="middle"');
   if(owned){
    body+=t(x+22,y+239,23,'Lv. '+(entry.level??'?'),'#c6d2e4',500)+t(x+336,y+239,16,element[meta.element]??'CHARACTER',elementColor,500,'text-anchor="end"');
   }else{
    body+=t(x+22,y+238,14,'LATEST PITY','#91a6bf',500,'letter-spacing="1"')+t(x+336,y+240,34,entry.pity,pityColor(entry.rank,entry.pity),600,'text-anchor="end"');
   }
  });
  if(!m.items.length)body+=t(600,360,23,m.empty??'No saved characters in this selection.','#9aaac0',400,'text-anchor="middle"');
  body+=t(48,height-25,15,'Choose a character below for the full card.','#9aacc3')+t(1150,height-25,15,'PAGE '+(m.page+1)+' / '+m.pages,'#9aacc3',500,'text-anchor="end"');
  return shell(height,body,'#b8b7ea');
 }
}
