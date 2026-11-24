import {UserError} from './history.mjs';

export const ICONS=[
 {key:'brand',name:'Title / Connect',symbol:'✦'},
 {key:'connect',name:'Connect',symbol:'◈'},
 {key:'history',name:'Wish History',symbol:'✧'},
 {key:'primogems',name:'Earned Primogems',symbol:'✪'},
 {key:'achievements',name:'Owned Characters',symbol:'✩'},
 {key:'home',name:'Home',symbol:'⌂'},
 {key:'search',name:'Search',symbol:'⌕'},
 {key:'refresh',name:'Refresh',symbol:'↻'},
 {key:'complete',name:'Completed',symbol:'✓'},
 {key:'unmarked',name:'Unmarked',symbol:'○'},
 {key:'selected',name:'Selected',symbol:'●'},
 {key:'previous',name:'Back / Previous',symbol:'←'},
 {key:'next',name:'Next',symbol:'→'},
 {key:'star',name:'Rarity star',symbol:'★'},
 {key:'currency_primogems',name:'Primogems',symbol:'💎'},
 {key:'currency_crystals',name:'Genesis Crystals',symbol:'💠'},
 {key:'currency_acquaint',name:'Acquaint Fates',symbol:'🔵'},
 {key:'currency_intertwined',name:'Intertwined Fates',symbol:'🌠'},
 {key:'currency_welkin',name:'Welkin Moon',symbol:'🌙'},
 {key:'akasha',name:'AKASHA',symbol:'🏆'},
 {key:'reminders',name:'Reminders',symbol:'🔔'},
 {key:'daily',name:'Daily Commissions',symbol:'📅'},
 {key:'resin',name:'Original Resin',symbol:'💧'},
];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pattern=new RegExp('['+ICONS.map(x=>x.symbol).join('')+']','gu');
const bySymbol=new Map(ICONS.map(x=>[x.symbol,x]));
const graphemes=new Intl.Segmenter('en',{granularity:'grapheme'});
function safeGlyph(value){return typeof value==='string'&&value.length<=32&&!/[<>&"'\u0000-\u001f\u007f]/u.test(value)&&[...graphemes.segment(value)].length===1&&/[\p{Extended_Pictographic}\p{Symbol}\u2713]/u.test(value);}
function valid(value){return value&&typeof value==='object'&&(value.text===''||safeGlyph(value.text))&&(!value.custom_emoji_id||(/^\d{1,30}$/.test(value.custom_emoji_id)&&safeGlyph(value.text)));}

export function iconFromMessage(message){
 const text=message.text??message.caption??'',entities=message.entities??message.caption_entities??[];
 const custom=entities.filter(e=>e.type==='custom_emoji');
 if(custom.length){
  if(custom.length!==1)throw new UserError('Send one premium emoji at a time.');
  const e=custom[0],glyph=text.slice(e.offset,e.offset+e.length);
  if((text.slice(0,e.offset)+text.slice(e.offset+e.length)).trim())throw new UserError('Send only the emoji, without extra text.');
  const value={text:glyph,custom_emoji_id:String(e.custom_emoji_id??'')};
  if(!valid(value))throw new UserError('That custom emoji could not be read. Send it directly from your emoji picker.');
  return value;
 }
 if(safeGlyph(text.trim()))return {text:text.trim()};
 throw new UserError('Send one regular or premium emoji from your emoji picker. Use the buttons to remove or reset an icon.');
}

export class IconTheme{
 constructor(store){this.store=store;this.reload();}
 reload(){this.values={};try{const data=JSON.parse(this.store.getMeta('icon_theme_v1')??'{}');for(const item of ICONS)if(valid(data[item.key]))this.values[item.key]=data[item.key];}catch{}}
 item(key){const item=ICONS.find(x=>x.key===key);if(!item)throw new UserError('Unknown icon.');return item;}
 value(key){return this.values[key]??{text:this.item(key).symbol};}
 set(key,value){this.item(key);if(value===null)delete this.values[key];else{if(!valid(value))throw new UserError('Invalid icon.');this.values[key]=value;}this.store.setMeta('icon_theme_v1',JSON.stringify(this.values));}
 plain(text){return String(text).replace(pattern,symbol=>this.value(bySymbol.get(symbol).key).text);}
 html(text,custom=true){
  let pre=0,code=0;
  return String(text).split(/(<[^>]*>)/g).map(part=>{
   if(part.startsWith('<')){if(/^<pre(?:\s|>)/i.test(part))pre++;if(/^<\/pre>/i.test(part))pre--;if(/^<code(?:\s|>)/i.test(part))code++;if(/^<\/code>/i.test(part))code--;return part;}
   return part.replace(pattern,symbol=>{const value=this.value(bySymbol.get(symbol).key);return custom&&!pre&&!code&&value.custom_emoji_id?'<tg-emoji emoji-id="'+value.custom_emoji_id+'">'+escape(value.text)+'</tg-emoji>':escape(value.text);});
  }).join('');
 }
 keyboard(markup,custom=true){
  if(!markup?.inline_keyboard)return markup;
  return {...markup,inline_keyboard:markup.inline_keyboard.map(row=>row.map(button=>{
   const {ui_icon,...clean}=button;
   let chosen=custom&&ui_icon?.custom_emoji_id?ui_icon.custom_emoji_id:null;
   const prefix=ui_icon&&!chosen?(ui_icon.text+' '):'';
   const text=(prefix+button.text.replace(pattern,symbol=>{const value=this.value(bySymbol.get(symbol).key);if(custom&&value.custom_emoji_id&&!chosen){chosen=value.custom_emoji_id;return '';}return value.text;})).trim();
   return {...clean,text:text||'·',...(chosen?{icon_custom_emoji_id:chosen}:{})};
  }))};
 }
 payload(params,custom=true){
  const p={...params};
  if(typeof p.text==='string')p.text=p.parse_mode==='HTML'?this.html(p.text,custom):this.plain(p.text);
  if(typeof p.caption==='string')p.caption=p.parse_mode==='HTML'?this.html(p.caption,custom):this.plain(p.caption);
  if(p.media&&typeof p.media==='object')p.media=this.payload(p.media,custom);
  if(p.reply_markup)p.reply_markup=this.keyboard(p.reply_markup,custom);
  return p;
 }
}

// Render centrally so an icon change applies to every new menu and photo caption.
export class ThemedTelegram{
 constructor(telegram,theme){this.telegram=telegram;this.theme=theme;this.customEmojiFallbacks=0;}
 async call(method,params={},form=null){
  if(form)return this.telegram.call(method,params,form);
  const decorated=this.theme.payload(params);
  try{return await this.telegram.call(method,decorated);}catch(error){
   if(error.code!==400||error.notModified||!JSON.stringify(decorated).match(/tg-emoji|icon_custom_emoji_id/))throw error;
   this.customEmojiFallbacks++;
   return this.telegram.call(method,this.theme.payload(params,false));
  }
 }
 message(chat,text,extra={}){return this.call('sendMessage',{chat_id:chat,text,link_preview_options:{is_disabled:true},...extra});}
 async photo(params,bytes){
  const decorated=this.theme.payload(params);
  try{return await this.telegram.photo(decorated,bytes);}catch(error){
   if(error.code!==400||error.notModified||!JSON.stringify(decorated).match(/tg-emoji|icon_custom_emoji_id/))throw error;
   this.customEmojiFallbacks++;return this.telegram.photo(this.theme.payload(params,false),bytes);
  }
 }
 document(chat,buffer,filename,caption=''){return this.telegram.document(chat,buffer,filename,this.theme.plain(caption));}
 download(file){return this.telegram.download(file);}
}
