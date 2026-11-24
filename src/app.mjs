import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {parseImport,sortWishes,stats,withPity,pityLabel,UserError,MAX_UPLOAD_BYTES,hasSecret,BANNERS,pool} from './history.mjs';
import {patchGroups} from './patches.mjs';
import {catalogue,achievementById,parseUIAF,exportUIAF} from './achievements.mjs';
import {zipFiles} from './zip.mjs';
import {HoyoError} from './hoyo.mjs';
import {ICONS,iconFromMessage} from './icons.mjs';
import {items,itemInfo,itemId} from './artwork.mjs';
import {collection} from './collection.mjs';
import {Savings} from './savings.mjs';
import {Roster} from './roster.mjs';
import {CookieLogin} from './cookie-login.mjs';
import {cookieCapabilities} from './vault.mjs';
import {weaponById} from './roster-data.mjs';
import {tutorialLink} from './tutorial-link.mjs';
const btn=(text,callback_data)=>({text,callback_data});
const kb=rows=>({inline_keyboard:rows});
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const home=[btn('⌂ Home','start')];
const date=x=>x?String(x).slice(0,16).replace('T',' ')+' UTC':'Not checked yet';
export const MENU=kb([[btn('✦ Connect','connect'),btn('✧ Wish History','history')],[btn('✪ Earned Primogems','primogems'),btn('✩ Owned Characters','characters')]]);
export const COMMANDS=[['connect','Connect — video guide and personal Windows ZIP'],['history','Wish History — explore wishes by game patch'],['primogems','Earned Primogems — your HoYoLAB monthly income'],['characters','Owned Characters — constellations and 5-star weapons']].map(([command,description])=>({command,description}));
export const TUTORIAL=`<b>✦ CONNECT</b>\n\nThe video guide is coming soon. Your personal Windows ZIP is available now.\n\nExtract the ZIP, run Connect.cmd, sign in on both official pages, then send Primogemless.connect.json here. Your game can stay closed.`;
export const PRIVACY=`<b>◈ YOUR DATA</b>\n\nThe bot stores your Telegram ID, Genshin UIDs, wishes, manually saved currency balances, diary income summaries, roster snapshots, manual weapon entries and achievement journal. Connected HoYoverse sessions are encrypted on the bot server. The operator can use them to access account data; these are broader credentials than a wish-history key.\n\nThe helper signs you in on official HoYoverse pages in an isolated browser. It does not collect your password. The Windows helper sends only an encrypted connection package through Telegram. Never send passwords or wish links. Advanced cookie entry is accepted only after you explicitly start it in /login; it passes raw cookies through Telegram, requests message deletion and encrypts the session on the server.\n\nDisconnect erases the bot's session and stops syncing. Delete data removes your saved records too. Telegram messages and external backups are separate.\n\nIndependent fan project; unofficial interfaces. No game clicking, process-memory access or game-file edits. Session expiry and upstream changes can interrupt syncing.`;
const artMap=JSON.parse(readFileSync(new URL('../assets/enka-icons.json',import.meta.url))).items;
const itemIds=JSON.parse(readFileSync(new URL('../exporter/item-dictionary.json',import.meta.url)));
export class BotApp {
 constructor({telegram,store,vault=null,hoyo=null,sync=null,icons=null,ownerId=null,art=null,renderer=null}){this.tg=telegram;this.store=store;this.vault=vault;this.hoyo=hoyo;this.sync=sync;this.icons=icons;this.ownerId=ownerId?String(ownerId):null;this.art=art;this.renderer=renderer;this.savings=new Savings(this);this.roster=new Roster(this);this.cookieLogin=new CookieLogin(this);this.limits=new Map();this.context=new AsyncLocalStorage();}
 isOwner(owner){return !!this.ownerId&&String(owner)===this.ownerId;}
 menu(owner){return kb([...MENU.inline_keyboard,...(this.isOwner(owner)?[[btn('My Game Profile','savings')]]:[])]);}
 async say(chat,text,markup=this.menu(chat),edit=true){const target=edit?this.context.getStore()?.message:null;const extra={parse_mode:'HTML',reply_markup:markup};if(target&&String(target.chat.id)===String(chat)){try{if(target.text)return await this.tg.call('editMessageText',{chat_id:chat,message_id:target.message_id,text,...extra,link_preview_options:{is_disabled:true}});if(target.photo&&text.length<950)return await this.tg.call('editMessageCaption',{chat_id:chat,message_id:target.message_id,caption:text,...extra});}catch(error){if(error.notModified)return;if(error.code!==400)throw error;}}return this.tg.message(chat,text,extra);}
 async visual(chat,caption,markup,model){
  if(!this.renderer)return this.say(chat,caption,markup);
  await this.tg.call('sendChatAction',{chat_id:chat,action:'upload_photo'}).catch(()=>{});
  let card;try{card=await this.renderer.render(model);}catch{return this.say(chat,caption,markup);}
  const target=this.context.getStore()?.message,messageId=target?.photo&&String(target.chat.id)===String(chat)?target.message_id:null;
  const params={chat_id:chat,caption,parse_mode:'HTML',reply_markup:markup,...(messageId?{message_id:messageId}:{})},key='renderphoto:'+card.key,cached=this.store.getMeta(key);
  const remember=result=>{if(result?.photo?.at(-1)?.file_id)this.store.setMeta(key,result.photo.at(-1).file_id);return result;};
  if(cached)try{return remember(messageId?await this.tg.call('editMessageMedia',{chat_id:chat,message_id:messageId,media:{type:'photo',media:cached,caption,parse_mode:'HTML'},reply_markup:markup}):await this.tg.call('sendPhoto',{...params,photo:cached}));}catch(error){if(error.notModified)return;if(error.code!==400)throw error;}
  try{return remember(await this.tg.photo(params,card.png()));}catch(error){if(error.notModified)return;if(error.code!==400)throw error;return this.say(chat,caption,markup);}
 }
 async tutorial(chat,owner,sendZip=false){
  this.store.setUI(owner,{});
  const admin=this.isOwner(owner),link=this.savedGuideLink(),video=this.savedConnectVideo();
  const markup=kb([...(link&&!video?[[{text:'▶ Watch video',url:link}]]:[]),[btn('Download personal ZIP','beginlogin')],[btn('◈ Connection settings','login'),btn('Privacy & data','privacy')],...(admin?[[btn(video?'Replace video':'Set video','setconnectvideo'),...(video?[btn('Remove video','clearconnectvideo')]:[])],[btn(link?'Change channel link':'Add channel link','guidelink:wishes'),...(link?[btn('Remove link','guideclear:wishes')]:[])]]:[]),...(admin&&this.icons?[[btn('Customize icons','icons'),...(this.art?[btn('Artwork & emojis','art:0')]:[])]]:[]),home]);
  const caption='<b>✦ CONNECT</b>\n\nWatch the video, then extract your personal ZIP and run Connect.cmd. Sign in on both official pages and send Primogemless.connect.json here.\n\nWindows · your game can stay closed.\nYour personal ZIP expires in 30 minutes. Read Privacy & data before signing in.';
  if(video){
   try{await this.tg.call('sendVideo',{chat_id:chat,video:video.file_id,caption,parse_mode:'HTML',supports_streaming:true,reply_markup:markup});}
   catch(error){if(error.code!==400)throw error;await this.say(chat,'<b>✦ CONNECT</b>\n\nThe video is temporarily unavailable. You can still download your personal ZIP below.',markup,false);}
  }else await this.say(chat,link?caption:TUTORIAL,markup,false);
  if(sendZip&&this.vault)return this.connectionPackage(chat,owner);
 }
 savedConnectVideo(){try{const value=JSON.parse(this.store.getMeta('connect_video_v1')??'null');return typeof value?.file_id==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(value.file_id)?value:null;}catch{return null;}}
 async editConnectVideo(chat,owner){this.requireGuideOwner(owner);this.store.setUI(owner,{editingConnectVideo:true});return this.say(chat,'<b>Set the Connect video</b>\n\nSend your recording here as a Telegram video (not as a file). It will appear for everyone who opens Connect, followed by their personal ZIP.\n\nOnly you can replace or remove it.',kb([[btn('Cancel','connectpreview')]]));}
 async saveConnectVideo(chat,owner,message){this.requireGuideOwner(owner);if(!this.store.getUI(owner).editingConnectVideo)throw new UserError('Open Connect → Set video first.');const video=message.video;if(!video||typeof video.file_id!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(video.file_id))throw new UserError('Send the recording as a Telegram video, not a document or link.');this.store.setMeta('connect_video_v1',JSON.stringify({file_id:video.file_id,saved_at:new Date().toISOString()}));this.store.setUI(owner,{});return this.tutorial(chat,owner);}
 savedGuideLink(){try{const saved=this.store.getMeta('tutorial_link:wishes');return saved?tutorialLink(saved):null;}catch{return null;}}
 async guide(chat,owner,step){
  this.store.setUI(owner,{});
  if(step==='hoyolab')return this.login(chat,owner);
  if(step==='wishes')return this.wishGuide(chat,owner);
  throw new UserError('Open Connect to watch the guide and download your personal ZIP.');
 }
 async wishGuide(chat,owner){
  const connection=this.store.connection(owner),caps=this.connectionCapabilities(owner),account=this.store.selected(owner),enabled=!!connection&&caps.wishes,ready=enabled&&connection.status==='active';
  const link=this.savedGuideLink();
  const summary=ready?'<b>Your wish history is connected.</b>':enabled?'<b>Your wish connection needs attention.</b>':connection?'<b>HoYoLAB is connected. Wish syncing still needs setup.</b>':'<b>Connect your wish history to get started.</b>';
  const text='<b>Wish connection status</b>\n\n'+summary+(account?'\n'+account.count+' pulls saved for this account.':'')+(connection?.last_sync?'\nLast successful check: '+date(connection.last_sync):'')+'\n\n'+(link?'Tap Watch tutorial for the video guide.':ready?'Open your wishes below, or tap Sync now for a new check.':'Use Set up wish syncing below, or upload an existing UIGF history file.')+(ready?'\nAutomatic checks run every 6 hours while the server is online.':'');
  return this.say(chat,text,kb([...(link?[[{text:'▶ Watch video',url:link}]]:[]),[btn('✧ Open Wish History','history')],ready? [btn('↻ Sync now','sync')]:[btn(enabled?'Reconnect wish syncing':'Set up wish syncing','connect')],[btn('◈ Connection settings','login'),btn('← Connect','connectpreview')]]));
 }
 requireGuideOwner(owner){if(!this.ownerId||String(owner)!==this.ownerId)throw new UserError('Only the bot owner can edit the Connect video or links.');}
 async editGuideLink(chat,owner){this.requireGuideOwner(owner);this.store.setUI(owner,{editingGuideLink:'wishes'});return this.say(chat,'<b>Add a video channel link</b>\n\nSend a public Telegram video post or channel link.\nExample: <code>https://t.me/YourChannel/123</code>\n\nThis is a fallback link. To play the video inside the bot, use Connect → Set video and send the recording directly.',kb([[btn('Cancel','connectpreview')]]));}
 async saveGuideLink(chat,owner,text){this.requireGuideOwner(owner);const link=tutorialLink(text);this.store.setMeta('tutorial_link:wishes',link);this.store.setUI(owner,{});return this.tutorial(chat,owner);}
 requireArtOwner(owner){if(!this.art||!this.ownerId||String(owner)!==this.ownerId)throw new UserError('Only the bot owner can change artwork.');}
 artNavigation(owner,item=null){const ui=this.store.getUI(owner);return {artKind:ui.artKind??(item?.kind==='weapon'&&weaponById.has(item.id)?'w':'c'),artQuery:ui.artQuery??'',artPage:ui.artPage??0};}
 async artSettings(chat,owner,page=0,query=null,kind=null){
  this.requireArtOwner(owner);const navigation=this.artNavigation(owner);kind=kind??navigation.artKind;query=query??navigation.artQuery;
  if(!['c','w'].includes(kind))throw new UserError('Choose Characters or 5★ Weapons.');
  const list=items.filter(x=>(kind==='w'?weaponById.has(x.id):query?true:x.kind==='character')&&(!query||x.name.toLowerCase().includes(query.toLowerCase()))),pages=Math.max(1,Math.ceil(list.length/12));
  if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('Invalid artwork page.');
  this.store.setUI(owner,{artKind:kind,artQuery:query,artPage:page});
  const buttons=list.slice(page*12,page*12+12).map(x=>({...btn(x.name.slice(0,22),'artitem:'+x.id),ui_icon:this.art.emoji(x.id)})),rows=[];
  for(let i=0;i<buttons.length;i+=3)rows.push(buttons.slice(i,i+3));
  const nav=[];if(page)nav.push(btn('← Previous','art:'+(page-1)));if(page+1<pages)nav.push(btn('Next →','art:'+(page+1)));
  return this.say(chat,'<b>Artwork & emojis · '+(kind==='w'?'5★ Weapons':'Characters')+'</b>\nOwner access only · '+list.length+' items\n\nChoose a name → Set button emoji → send your premium emoji.\n'+(kind==='w'?'All supported 5★ weapons are available here, including ones you do not own.\n':'')+'Page '+(page+1)+' / '+pages,kb([[btn((kind==='c'?'● ':'')+'Characters','arttab:c'),btn((kind==='w'?'● ':'')+'5★ Weapons','arttab:w')],...rows,...(nav.length?[nav]:[]),[btn('⌕ Search','artsearch'),btn('Clear search','arttab:'+kind)],home]));
 }
 async artItem(chat,owner,id){
  this.requireArtOwner(owner);const item=itemInfo(id),navigation=this.artNavigation(owner,item),custom=this.art.override(id),emoji=this.art.emoji(id);this.store.setUI(owner,navigation);
  return this.visual(chat,'<b>'+esc(item.name)+'</b>\n\nArtwork: '+(custom?'your upload':'automatic HoYoverse art')+'\nButton icon: '+(emoji?'customized':'not set')+'\n\nThese settings apply to everyone. Only you can edit them.',kb([[btn('Replace image','artset:'+id),btn('Set button emoji','artemoji:'+id)],[btn('Reset image','artreset:'+id),btn('Reset emoji','emojireset:'+id)],[btn('← Artwork & emojis','art:'+navigation.artPage)]]),{type:'artpreview',id,name:item.name});
 }
 async saveArtwork(chat,owner,message){
  this.requireArtOwner(owner);const id=this.store.getUI(owner).editingArt;itemInfo(id);
  const file=message.photo?.at(-1)??message.document;if(!file?.file_id||Number(file.file_size)>MAX_UPLOAD_BYTES)throw new UserError('Use a PNG or JPEG below 10 MB.');
  const bytes=await this.tg.download(file.file_id);this.art.save(id,bytes);this.store.setUI(owner,this.artNavigation(owner));
  await this.artItem(chat,owner,id);
 }
 async saveItemEmoji(chat,owner,message){this.requireArtOwner(owner);const id=this.store.getUI(owner).editingItemEmoji;this.art.setEmoji(id,iconFromMessage(message));this.store.setUI(owner,this.artNavigation(owner));return this.artItem(chat,owner,id);}
 async grid(chat,owner,uid,id,kind='c',rank='a',page=0){
  const g=this.group(owner,uid,id),list=collection(g.rows,kind,rank),pages=Math.max(1,Math.ceil(list.length/9));
  if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('That collection page is unavailable.');
  const visible=list.slice(page*9,page*9+9),buttons=visible.map(x=>({...btn(x.name.length>19?x.name.slice(0,18)+'…':x.name,'v:'+uid+':'+id+':'+x.id+':0:'+page+':'+rank),ui_icon:this.art?.emoji(x.id)})),rows=[];
  for(let i=0;i<buttons.length;i+=3)rows.push(buttons.slice(i,i+3));
  const route=(k,r,p=0)=>'g:'+uid+':'+id+':'+k+':'+r+':'+p,nav=[];
  if(page)nav.push(btn('← Previous',route(kind,rank,page-1)));if(page+1<pages)nav.push(btn('Next →',route(kind,rank,page+1)));
  const caption='<b>✧ '+esc(g.label.toUpperCase())+'</b>\n<b>'+g.total+'</b> wishes · <b>'+g.five+'</b> five-stars · <b>'+g.four+'</b> four-stars\n\n'+(list.length?'Tap a name to open its card.':'No saved '+(kind==='c'?'characters':'weapons')+' in this selection.')+'\n<i>Pity uses all saved patches. + means earlier history is missing.</i>';
  const selected=(label,data,active)=>({...btn(label,data),...(active?{style:'primary'}:{})});
  return this.visual(chat,caption,kb([
   [selected('Characters',route('c',rank),kind==='c'),selected('Weapons',route('w',rank),kind==='w')],
   [selected('All rarities',route(kind,'a'),rank==='a'),selected('5★',route(kind,'5'),rank==='5'),selected('4★',route(kind,'4'),rank==='4')],
   ...rows,...(nav.length?[nav]:[]),[btn('4★ / 5★ pulls','w:'+uid+':'+id+':0'),btn('← All patches','history')],home]),
   {type:'grid',title:g.label,subtitle:g.total+' wishes  /  '+g.five+' five-stars  /  '+g.four+' four-stars',items:visible,page,pages,kind});
 }
 async itemCard(chat,owner,uid,id,item,index=0,gridPage=0,rank='a'){
  if(!/^\d{1,12}$/.test(item)||!['a','4','5'].includes(rank)||!Number.isInteger(gridPage)||gridPage<0)throw new UserError('Invalid character card.');
  const g=this.group(owner,uid,id),hits=g.rows.filter(r=>itemId(r)===item),r=hits[index];
  if(!Number.isInteger(index)||index<0||!r)throw new UserError('That saved wish is unavailable.');
  const kind=artMap[item]?.kind==='character'||/^100\d{5}$/.test(item)?'c':'w',nav=[];
  if(index)nav.push(btn('← Newer','v:'+uid+':'+id+':'+item+':'+(index-1)+':'+gridPage+':'+rank));
  if(index+1<hits.length)nav.push(btn('Older →','v:'+uid+':'+id+':'+item+':'+(index+1)+':'+gridPage+':'+rank));
  const markup=kb([...(nav.length?[nav]:[]),[btn('← '+(kind==='c'?'Characters':'Weapons'),'g:'+uid+':'+id+':'+kind+':'+rank+':'+gridPage)],[btn('All patches','history'),btn('⌂ Home','start')],...(String(owner)===this.ownerId&&this.art&&artMap[item]?[[btn('Edit artwork / emoji','artitem:'+item)]]:[])]);
  return this.hitCard(chat,owner,uid,g,r,index,hits.length,markup,hits.length);
 }
 async hitCard(chat,owner,uid,g,r,index,total,markup,copies){
  return this.visual(chat,'<b>'+r.rank_type+'★ '+esc(r.name)+'</b> · <b>'+pityLabel(r)+'</b>\n'+esc(g.label)+' · '+BANNERS[pool(r.gacha_type)]+'\n<i>Saved history only'+(r.pity.anchored?'':'; earlier pulls are missing')+'.</i>',markup,{type:'hit',row:r,patch:g.label,banner:BANNERS[pool(r.gacha_type)],uid,index,total,copies});
 }
 account(owner,uid=null){const a=uid?this.store.accounts(owner).find(x=>x.uid===uid):this.store.selected(owner);if(!a)throw new UserError('Connect your Genshin account first, or send an existing UIGF wish file.');return a;}
 handle(update){return this.context.run({message:update.callback_query?.message},()=>this.handleUpdate(update));}
 async handleUpdate(update){
  const cb=update.callback_query,m=cb?.message??update.message,actor=cb?.from??m?.from;
  if(!m||m.chat?.type!=='private'||!actor||actor.is_bot||String(actor.id)!==String(m.chat.id))return;
  const owner=String(actor.id),chat=m.chat.id;
  if(cb)await this.tg.call('answerCallbackQuery',{callback_query_id:cb.id}).catch(()=>{});
  const now=Date.now(),lim=this.limits.get(owner)??{window:now,count:0,upload:0};
  if(now-lim.window>2000){lim.window=now;lim.count=0;}this.limits.set(owner,lim);
  if(!m.document&&++lim.count>4)return;
  if(this.limits.size>10000)for(const [key,x]of this.limits)if(now-x.window>300000)this.limits.delete(key);
  try{
   if(!cb&&(m.video||m.document||m.photo)&&this.store.getUI(owner).editingConnectVideo)return await this.saveConnectVideo(chat,owner,m);
   if(!cb&&m.video)return await this.say(chat,this.isOwner(owner)?'Open Connect → Set video, then send your recording.':'Open Connect to get the video guide and your personal ZIP.');
   if(!cb&&(m.photo||m.document)&&this.store.getUI(owner).editingArt)return await this.saveArtwork(chat,owner,m);
   if(!cb&&m.document){
    if(now-lim.upload<3000)throw new UserError('Wait a few seconds before sending another file.');lim.upload=now;
    const d=m.document;if(!/\.(json|txt)$/i.test(d.file_name??''))throw new UserError('Send a JSON file, or the encrypted .connect.json file created by the connection helper.');
    if(Number(d.file_size)>MAX_UPLOAD_BYTES)throw new UserError('Maximum file size: 10 MB.');
    const bytes=await this.tg.download(d.file_id);let doc;try{doc=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw new UserError('This file is not valid JSON.');}
    if(doc?.kind==='primogemless-connect-v1')return await this.connectFile(chat,owner,doc,bytes.length,m.message_id);
    if(hasSecret(bytes.toString('utf8'))){await this.tg.call('deleteMessage',{chat_id:chat,message_id:m.message_id}).catch(()=>{});throw new UserError('This file appears to contain a credential or link. It was not imported. Use Connect for encrypted account linking.');}
    if(doc?.info?.uiaf_version){const a=this.account(owner),rows=parseUIAF(bytes);this.store.setAchievements(owner,a.uid,rows);return await this.say(chat,`<b>✩ Journal updated</b>\n${rows.length} records merged for UID ${a.uid}.`,kb([[btn('Open journal','achievements')],home]));}
    const r=this.store.import(owner,parseImport(bytes));return await this.say(chat,`<b>✧ History saved</b>\n\n<b>${r.added}</b> new pulls · ${r.duplicates} duplicates skipped\n<b>${r.total}</b> pulls in your archive\n\nExplore your journey by patch.`,kb([[btn('Open history','history')],home]));
   }
   const text=(m.text??'').trim();
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).cookieLogin)return await this.cookieLogin.accept(chat,owner,m);
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).editingGuideLink)return await this.saveGuideLink(chat,owner,text);
   if(!cb&&hasSecret(text)){await this.tg.call('deleteMessage',{chat_id:chat,message_id:m.message_id}).catch(()=>{});throw new UserError('Cookie entry is not active. Open /login first. Do not send passwords or wish links.');}
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).editingConnectVideo)return await this.saveConnectVideo(chat,owner,m);
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).editingIcon)return await this.saveIcon(chat,owner,m);
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).editingItemEmoji)return await this.saveItemEmoji(chat,owner,m);
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).artSearch){return await this.artSettings(chat,owner,0,text);}
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).savingsUid)return await this.savings.accept(chat,owner,text);
   if(!cb&&text&&!text.startsWith('/')&&(this.store.getUI(owner).manualWeapon||this.store.getUI(owner).rosterSearchUid))return await this.roster.accept(chat,owner,text);
   const action=cb?.data??text.split(/\s/)[0].replace(/^\//,'').replace(/@\w+$/,'').toLowerCase();
   if(this.store.getUI(owner).editingIcon&&!/^(i|ir|in):/.test(action))this.store.setUI(owner,{});
   if(cb||text.startsWith('/')){const ui=this.store.getUI(owner);if(ui.editingArt||ui.editingItemEmoji||ui.artSearch||ui.savingsUid||ui.manualWeapon||ui.rosterSearchUid||ui.cookieLogin||ui.editingGuideLink||ui.editingConnectVideo)this.store.setUI(owner,ui.editingArt||ui.editingItemEmoji||ui.artSearch?this.artNavigation(owner):{});}
   if(!cb&&/^\/achievements(?:@\w+)?\s+/i.test(text))return await this.search(chat,owner,text.replace(/^\/achievements(?:@\w+)?\s+/i,''));
   if(!cb&&text&&!text.startsWith('/')&&this.store.getUI(owner).awaitingSearch){this.store.setUI(owner,{});return await this.search(chat,owner,text);}
   const bits=action.split(':');
   if(bits[0]==='walk')return await this.tutorial(chat,owner);
   if(bits[0]==='guidelink'&&bits[1]==='wishes')return await this.editGuideLink(chat,owner);
   if(bits[0]==='guideclear'&&bits[1]==='wishes'){this.requireGuideOwner(owner);this.store.setMeta('tutorial_link:wishes','');this.store.setUI(owner,{});return await this.tutorial(chat,owner);}
   if(bits[0]==='guide')return await this.guide(chat,owner,bits[1]);
   if(this.roster.handles(bits[0]))return await this.roster.route(chat,owner,bits);
   if(bits[0]==='savlog')return await this.savings.log(chat,owner,Number(bits[1]));
   if(bits[0]==='savfield')return await this.savings.editField(chat,owner,bits[1]);
   if(bits[0]==='diary'||bits[0]==='df')return await this.savings.diary(chat,owner,bits[1],bits[0]==='df');
   if(bits[0]==='g')return await this.grid(chat,owner,bits[1],bits[2],bits[3],bits[4],Number(bits[5]));
   if(bits[0]==='v')return await this.itemCard(chat,owner,bits[1],bits[2],bits[3],Number(bits[4]),Number(bits[5]??0),bits[6]??'a');
   if(bits[0]==='arttab')return await this.artSettings(chat,owner,0,'',bits[1]);
   if(bits[0]==='art')return await this.artSettings(chat,owner,Number(bits[1]??0));
   if(bits[0]==='artitem')return await this.artItem(chat,owner,bits[1]);
   if(bits[0]==='artset'||bits[0]==='artemoji'){
    this.requireArtOwner(owner);const item=itemInfo(bits[1]);this.store.setUI(owner,{...this.artNavigation(owner,item),...(bits[0]==='artset'?{editingArt:item.id}:{editingItemEmoji:item.id})});
    return await this.say(chat,'<b>'+esc(item.name)+'</b>\n\n'+(bits[0]==='artset'?'Send a PNG or JPEG as a photo or file. It will replace the large card artwork for everyone. A landscape image with the character toward the right works best.':'Send one regular or premium emoji. It will appear beside this item’s name in the pickers.'),kb([[btn('Cancel','artitem:'+item.id)]]));
   }
   if(bits[0]==='artreset'||bits[0]==='emojireset'){this.requireArtOwner(owner);if(bits[0]==='artreset')this.art.reset(bits[1]);else this.art.setEmoji(bits[1],null);return await this.artItem(chat,owner,bits[1]);}
   if(bits[0]==='i')return await this.editIcon(chat,owner,bits[1]);
   if(bits[0]==='ir'||bits[0]==='in'){this.requireIconOwner(owner);this.icons.set(bits[1],bits[0]==='ir'?null:{text:''});this.store.setUI(owner,{});return await this.iconSettings(chat,owner);}
   if(bits[0]==='a'){this.store.select(owner,bits[1]);return await this.history(chat,owner);}
   if(bits[0]==='p')return await this.patch(chat,owner,bits[1],bits[2]);
   if(bits[0]==='w')return await this.wishes(chat,owner,bits[1],bits[2],Number(bits[3]));
   if(bits[0]==='c')return await this.card(chat,owner,bits[1],bits[2],Number(bits[3]??0),bits[4]??'5');
   if(bits[0]==='ag')return await this.categories(chat,owner,Number(bits[1]));
   if(bits[0]==='al')return await this.achievementList(chat,owner,bits[1],Number(bits[2]),bits[3]);
   if(bits[0]==='ad')return await this.achievement(chat,owner,Number(bits[1]));
   if(bits[0]==='am'){const a=this.account(owner),id=Number(bits[1]);if(!achievementById.has(id)||!['0','1'].includes(bits[2]))throw new UserError('Invalid achievement.');this.store.setAchievements(owner,a.uid,[{id,current:0,status:bits[2]==='1'?3:1,timestamp:253402271999}],'manual');return await this.achievement(chat,owner,id);}
   if(bits[0]==='d'){this.store.deleteUser(owner,bits[1]);return await this.say(chat,'<b>Data deleted</b>\nYour session, wish archive, savings, diary summaries, roster and manual weapons, and achievement journal have been removed from the bot.');}
   switch(action){
    case 'start':case 'menu':case 'help':return await this.landing(chat,owner);
    case 'connect':case 'tutorial':return await this.tutorial(chat,owner,true);
    case 'connectpreview':return await this.tutorial(chat,owner);
    case 'setconnectvideo':return await this.editConnectVideo(chat,owner);
    case 'clearconnectvideo':this.requireGuideOwner(owner);this.store.setMeta('connect_video_v1','');return await this.tutorial(chat,owner);
    case 'artsearch':this.requireArtOwner(owner);this.store.setUI(owner,{...this.artNavigation(owner),artSearch:true});return await this.say(chat,'<b>Find artwork / emoji</b>\nSend a character or weapon name.',kb([[btn('Cancel','art:0')]]));
    case 'artall':this.store.setUI(owner,{});return await this.artSettings(chat,owner,0,'');
    case 'icons':return await this.iconSettings(chat,owner);
    case 'login':return await this.login(chat,owner);
    case 'cookielogin':return await this.cookieLogin.info(chat,owner);
    case 'cookiebegin':return await this.cookieLogin.begin(chat,owner);
    case 'cookieguide':return await this.cookieLogin.guide(chat);
    case 'beginlogin':return await this.connectionPackage(chat,owner);
    case 'sync':return await this.refresh(chat,owner);
    case 'disconnect':return await this.say(chat,'<b>Disconnect HoYoLAB?</b>\nAutomatic sync will stop and the saved login session will be erased. Your wishes and journal stay saved.',kb([[btn('Disconnect','disconnectyes')],[btn('Keep connected','login')]]));
    case 'disconnectyes':this.store.disconnect(owner);return await this.say(chat,'<b>Disconnected</b>\nThe bot no longer has your HoYoverse session. Saved records remain available.');
    case 'history':return await this.history(chat,owner);
    case 'primogems':this.store.setUI(owner,{});return await this.savings.diary(chat,owner);
    case 'characters':case 'roster':return await this.roster.characters(chat,owner);
    case 'profile':case 'savings':return await this.savings.show(chat,owner);
    case 'savedit':return await this.savings.edit(chat,owner);
    case 'savexport':return await this.savings.export(chat,owner);
    case 'accounts':return await this.accounts(chat,owner);
    case 'cards':{const a=this.account(owner);return await this.card(chat,owner,a.uid,'all',0);}
    case 'pity':case 'stats':return await this.overview(chat,owner);
    case 'achievements':return await this.achievements(chat,owner);
    case 'asearch':this.store.setUI(owner,{awaitingSearch:true});return await this.say(chat,'<b>⌕ Find an achievement</b>\nSend part of its name, description, or its numeric ID.',kb([[btn('Back to journal','achievements')]]));
    case 'aimport':return await this.say(chat,'<b>Import your checklist</b>\nSend a UIAF v1.0 or v1.1 JSON file here. It merges into your selected account.\n\nHoYoLAB does not provide an individual achievement export. Use an existing backup or mark achievements manually.\n\n<a href="https://uigf.org/en/standards/uiaf.html">About UIAF</a>',kb([[btn('Back','achievements')]]));
    case 'aexport':{const a=this.account(owner);return await this.tg.document(chat,Buffer.from(JSON.stringify(exportUIAF(this.store.achievementRows(owner,a.uid)),null,2)),`achievements-${a.uid}.uiaf.json`,'Your portable achievement checklist.');}
    case 'export':this.account(owner);return await this.tg.document(chat,Buffer.from(JSON.stringify(this.store.export(owner),null,2)),'Primogemless-wishes.uigf.json','All your saved wishes. Keep this backup private.');
    case 'privacy':return await this.say(chat,PRIVACY,kb([[btn('Download wishes','export')],[btn('Delete my bot data','delete_me')],home]));
    case 'delete_me':return await this.say(chat,'<b>Delete all your bot data?</b>\nThis erases your session, wishes, savings, diary summaries, roster and manual weapons, and achievement journal. Download backups first. This cannot be undone.',kb([[btn('Delete everything',`d:${this.store.confirmation(owner)}`)],[btn('Cancel','canceldelete')]]));
    case 'canceldelete':this.store.cancelDelete(owner);return await this.landing(chat,owner);
    default:return await this.landing(chat,owner);
   }
  }catch(error){if(error instanceof UserError)return this.say(chat,esc(error.message));if(error instanceof HoyoError)return this.say(chat,error.auth?'HoYoverse rejected this session. Open Connect and sign in again.':'HoYoverse could not complete this request. Your saved data is unchanged. Try again later.');throw error;}
 }
 requireIconOwner(owner){if(!this.icons||!this.ownerId||String(owner)!==this.ownerId)throw new UserError('Only the bot owner can change its icons.');}
 async iconSettings(chat,owner){
  this.requireIconOwner(owner);this.store.setUI(owner,{});
  const rows=[];for(let i=0;i<ICONS.length;i+=2)rows.push(ICONS.slice(i,i+2).map(item=>btn(item.symbol+' '+item.name,'i:'+item.key)));
  return this.say(chat,'<b>Customize your bot icons</b>\n\nChoose an icon, then send one regular or premium emoji. Changes apply to new screens for everyone.\n\nPremium emoji require Telegram eligibility for the bot. If Telegram rejects them, the regular emoji is shown. Fixed-width statistics use the regular emoji.\n\nOpen /start afterward to see your updated menu.',kb([...rows,home]));
 }
 async editIcon(chat,owner,key){
  this.requireIconOwner(owner);const item=this.icons.item(key);this.store.setUI(owner,{editingIcon:key});
  return this.say(chat,'<b>'+esc(item.name)+'</b>\n\nCurrent icon: '+item.symbol+'\n\nSend one emoji from your Telegram emoji picker. Premium emoji are read automatically; no ID or code needed.',kb([[btn('Remove icon','in:'+key),btn('Reset default','ir:'+key)],[btn('← All icons','icons')]]));
 }
 async saveIcon(chat,owner,message){
  this.requireIconOwner(owner);const key=this.store.getUI(owner).editingIcon,item=this.icons.item(key),value=iconFromMessage(message);
  this.icons.set(key,value);this.store.setUI(owner,{});
  const before=this.tg.customEmojiFallbacks??0;
  await this.say(chat,'<b>Icon saved</b>\n\n'+item.symbol+' '+esc(item.name)+'\n\nYour next menus will use this icon.',kb([[btn('Change another icon','icons'),btn('Preview menu','start')]]));
  if((this.tg.customEmojiFallbacks??0)>before)await this.say(chat,'Telegram rejected the premium emoji, so its regular fallback is shown. Check the bot owner’s Premium subscription or the bot’s custom-emoji eligibility.',kb([[btn('Icon settings','icons')]]));
 }
 async landing(chat,owner){
  this.store.setUI(owner,{});const accounts=this.store.accounts(owner),rows=accounts.flatMap(a=>this.store.rows(owner,a.uid)),n=rows.length,c=this.store.connection(owner),five=rows.filter(r=>r.rank_type==='5').length,four=rows.filter(r=>r.rank_type==='4').length;
  return this.visual(chat,'<b>✦ P R I M O G E M L E S S</b>\nYour journey, remembered.\n\n'+(n?'<b>'+n+'</b> wishes saved':'Your archive begins here.')+' · '+(c?.status==='active'?'sync connected':c?'connection needs attention':'connect whenever you’re ready'),this.menu(owner),
   {type:'dashboard',title:'A little luck. A lasting memory.',subtitle:'Your wishes, earned Primogems & owned characters.',metrics:[{value:n,label:'WISHES SAVED'},{value:five,label:'FIVE-STAR MOMENTS'},{value:four,label:'FOUR-STAR FINDS',color:'#bfa8e7'},{value:accounts.length,label:'ACCOUNTS'}],footer:'Choose your next destination below.'});
 }
 connectionCapabilities(owner){try{return cookieCapabilities(this.vault?.load(owner));}catch{return {hoyolab:false,wishes:false};}}
 async login(chat,owner){
  this.store.setUI(owner,{});const c=this.store.connection(owner);
  if(!c)return this.say(chat,'<b>◈ CONNECT HOYOLAB</b>\nChoose a connection method.\n\n<b>Windows helper</b> — official-site sign-in, encrypted file upload; supports wish syncing when verified.\n\n<b>Cookie connection</b> — advanced entry from phone or desktop for players who already have their cookies. HoYoLAB-only cookies enable roster features, not wish syncing.\n\nSessions are stored encrypted by the bot operator. Expired sessions need reconnecting.',kb([[btn('Windows encrypted helper','beginlogin')],[btn('Cookie connection · advanced','cookielogin')],[btn('Privacy & data','privacy')],home]));
  const caps=this.connectionCapabilities(owner);
  return this.say(chat,'<b>◈ YOUR CONNECTION</b>\n\nStatus: <b>'+(c.status==='active'?'Connected':c.status==='expired'?'Sign-in expired':'Retrying')+'</b>\nMode: <b>'+(caps.wishes?'Wish sync + available HoYoLAB data':'HoYoLAB only · wish auto-sync disabled')+'</b>\nLast successful check: '+date(c.last_sync)+'\nAutomatic checks: every 6 hours\n\nYour PC and game can be closed. The bot server must stay online.',kb([[btn('↻ Sync now','sync'),btn('Accounts','accounts')],[btn('Owned Characters','characters')],[btn('Windows helper','beginlogin'),btn('Cookie connection','cookielogin')],[btn('Disconnect','disconnect'),btn('Privacy & data','privacy')],home]));
 }
 async connectionPackage(chat,owner){if(!this.vault)throw new UserError('Account connection is not configured by the operator yet.');const config=this.vault.publicConfig(owner),root=new URL('../connect/',import.meta.url),files={};for(const name of ['Connect.ps1','Connect.cmd','README.txt'])files[name]=readFileSync(new URL(name,root));files['connection.json']=JSON.stringify(config,null,2);return this.tg.document(chat,zipFiles(files),'Connect-Primogemless.zip','Your personal ZIP · valid for 30 minutes. Use the newest ZIP if you request another.\n\nExtract All → open the extracted folder → run Connect.cmd. Sign in on HoYoLAB and the Genshin redemption page, then send Primogemless.connect.json here from this Telegram account.');}
 async connectFile(chat,owner,doc,size,messageId){
  if(!this.vault||!this.hoyo)throw new UserError('Account linking is unavailable.');if(size>160000)throw new UserError('Invalid connection package size.');
  const cookies=this.vault.decryptPackage(owner,doc);
  await this.finishConnection(chat,owner,cookies,()=>this.store.checkChallenge(owner,doc.challenge));
  await this.tg.call('deleteMessage',{chat_id:chat,message_id:messageId}).catch(()=>{});
 }
 async finishConnection(chat,owner,cookies,validateCurrent=()=>{}){
  const caps=cookieCapabilities(cookies),roles=await this.hoyo.roles(cookies);let initialRoster=null;
  if(caps.wishes)await this.hoyo.authkey(cookies,roles[0]);else initialRoster=await this.hoyo.roster(cookies,roles[0]);
  validateCurrent();
  this.store.import(owner,{accounts:roles.map(role=>({...role,list:[]}))});this.vault.save(owner,cookies);
  if(initialRoster)this.store.saveRoster(owner,roles[0].uid,initialRoster);this.store.setUI(owner,{});
  await this.say(chat,'<b>◈ Connected</b>\n'+roles.length+' Genshin account'+(roles.length===1?'':'s')+' found.\n\n'+(caps.wishes?'Wish syncing is enabled. The first check is starting.':'HoYoLAB roster access is enabled. Wish auto-sync is disabled with this cookie pair. Existing wish records are kept.')+'\n\nChecks run every 6 hours while the bot server is online.',kb([[btn('Owned Characters','characters'),btn('History','history')],[btn('Connection','login')]]));
  this.notifySync(chat,owner);
 }
 notifySync(chat,owner){this.sync?.request(owner).then(r=>!r.cancelled&&this.say(chat,'<b>✧ Sync complete</b>\n'+(r.wishes===false?'HoYoLAB updated · wish syncing is not enabled.':r.added+' new pulls added.')+'\n'+(r.rosters??0)+' roster snapshots refreshed.',kb([[btn('Owned Characters','characters'),btn('History','history')],home]),false)).catch(()=>this.say(chat,'The sync could not finish. Open Connect for the session status.',MENU,false).catch(()=>{}));}
 async refresh(chat,owner){if(!this.store.connection(owner)||!this.sync)throw new UserError('Connect HoYoLAB first to enable syncing.');await this.say(chat,'<b>↻ Checking HoYoverse</b>\nYour archive remains available while the check runs.',kb([[btn('History','history'),btn('Connection','login')]]));this.notifySync(chat,owner);}
 async accounts(chat,owner){const list=this.store.accounts(owner);if(!list.length)throw new UserError('No accounts are saved yet. Connect HoYoLAB first.');return this.say(chat,'<b>◈ CHOOSE AN ACCOUNT</b>',kb([...list.map(a=>[btn(`${a.uid} · ${a.count} wishes`,`a:${a.uid}`)]),home]));}
 async history(chat,owner){
  const a=this.account(owner),rows=this.store.rows(owner,a.uid),groups=patchGroups(rows,a.timezone),c=this.store.connection(owner),caps=this.connectionCapabilities(owner);
  if(c?.status==='active'&&this.sync&&(!c.last_sync||Date.now()-Date.parse(c.last_sync)>21600000))this.sync.request(owner).catch(()=>{});
  const five=rows.filter(r=>r.rank_type==='5').length,four=rows.filter(r=>r.rank_type==='4').length,patches=[];
  for(let i=0;i<groups.length;i+=2)patches.push(groups.slice(i,i+2).map(g=>btn(g.label+' · '+g.total,'p:'+a.uid+':'+g.id)));
  return this.visual(chat,'<b>✧ YOUR WISH HISTORY</b>\n<b>'+rows.length+'</b> total wishes · UID '+a.uid+'\n\nOpen your complete collection or choose a patch.\n'+(c?(caps.wishes?'Last wish sync: ':'HoYoLAB-only connection · wish auto-sync disabled\nLast HoYoLAB check: ')+date(c.last_sync):'<i>Archive saved · connect for automatic checks</i>'),
   kb([[{...btn('✦ All history · '+rows.length+' wishes','p:'+a.uid+':all'),style:'primary'}],...patches,[btn('Owned Characters','characters'),...(this.isOwner(owner)?[btn('My Game Profile','savings')]:[])],[btn('Pity overview','stats'),btn('Accounts','accounts')],[btn('↻ Refresh','sync'),btn('Backup','export')],home]),
   {type:'dashboard',title:'Every wish has a story.',subtitle:'All history, or one chapter at a time.',metrics:[{value:rows.length,label:'TOTAL WISHES'},{value:five,label:'FIVE-STARS'},{value:four,label:'FOUR-STARS',color:'#bfa8e7'},{value:groups.length,label:'SAVED PATCHES'}],uid:a.uid,footer:'Select a patch below to discover your characters.'});
 }
 group(owner,uid,id){
  const a=this.account(owner,uid),all=withPity(this.store.rows(owner,uid));
  if(id==='all')return {id,label:'All history',rows:sortWishes(all,true),total:all.length,five:all.filter(r=>r.rank_type==='5').length,four:all.filter(r=>r.rank_type==='4').length,banners:stats(all)};
  const g=patchGroups(all,a.timezone).find(g=>g.id===id);
  if(!g)throw new UserError('That patch has no saved wishes.');return g;
 }
 async patch(chat,owner,uid,id){return this.grid(chat,owner,uid,id,'c','a',0);}
 async wishes(chat,owner,uid,id,page){
  const g=this.group(owner,uid,id),visible=g.rows.filter(r=>['4','5'].includes(r.rank_type)),pages=Math.max(1,Math.ceil(visible.length/8));
  if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('That page is unavailable.');
  const list=visible.slice(page*8,page*8+8).map(r=>'<b>'+r.rank_type+'★ '+esc(r.name)+'</b>'+(r.pity?' · <b>'+pityLabel(r)+'</b>':'')+'\n'+r.time+' · '+BANNERS[pool(r.gacha_type)]).join('\n\n'),nav=[];
  if(page)nav.push(btn('← Newer','w:'+uid+':'+id+':'+(page-1)));
  if(page+1<pages)nav.push(btn('Older →','w:'+uid+':'+id+':'+(page+1)));
  const galleries=[...(g.five?[btn('5★ Cards','c:'+uid+':'+id+':0:5')]:[]),...(g.four?[btn('4★ Cards','c:'+uid+':'+id+':0:4')]:[])];
  return this.say(chat,'<b>✧ '+esc(g.label)+'</b> · '+(page+1)+'/'+pages+'\n4★ / 5★ pulls · '+visible.length+' shown of '+g.total+' total\n<i>Server time · + = earlier history missing</i>\n\n'+(list||'No 4★ or 5★ pulls in this selection.'),
   kb([...(nav.length?[nav]:[]),...(galleries.length?[galleries]:[]),[btn('← Overview','p:'+uid+':'+id)],home]));
 }
 async overview(chat,owner){const a=this.account(owner),rows=this.store.rows(owner,a.uid),groups=stats(rows).filter(g=>g.total);return this.say(chat,`<b>✧ ALL-TIME OVERVIEW</b>\nUID ${a.uid} · ${rows.length} wishes\n\n${groups.map(g=>`<b>${g.name}</b> · ${g.total} pulls\n${g.five} five-stars · ${g.four} four-stars\n${g.previousFiveFound?`${g.sinceFive} recorded pulls since latest 5★`:'No 5★ in the saved span'}`).join('\n\n')}\n\n<i>Missing or unsynced pulls make current pity uncertain. Character Event banners share one count.</i>`,kb([[btn('Five-star cards',`c:${a.uid}:all:0`)],[btn('← Patches','history')],home]));}
 async card(chat,owner,uid,id,page,rank='5'){
  if(!['4','5'].includes(rank))throw new UserError('Choose four-star or five-star cards.');
  const g=this.group(owner,uid,id),hits=g.rows.filter(r=>r.rank_type===rank),r=hits[page];
  if(!Number.isInteger(page)||page<0||!r)throw new UserError('No '+rank+'★ card on this page.');
  if(this.renderer){
   const nav=[];if(page)nav.push(btn('← Newer','c:'+uid+':'+id+':'+(page-1)+':'+rank));if(page+1<hits.length)nav.push(btn('Older →','c:'+uid+':'+id+':'+(page+1)+':'+rank));
   return this.hitCard(chat,owner,uid,g,r,page,hits.length,kb([...(nav.length?[nav]:[]),[btn('← Collection','p:'+uid+':'+id)],home]),g.rows.filter(x=>itemId(x)===itemId(r)).length);
  }
  const caption='<b>'+esc(r.name)+'</b>\n<pre>RARITY    PITY\n'+rank+'★        '+r.pity.count+(r.pity.anchored?'':'+')+'</pre>\n'+
   (r.pity.anchored?'<i>Counted from the previous '+rank+'★ in this banner pool.</i>':'<i>At least '+r.pity.count+' pulls; earlier history is missing.</i>')+
   '\n\n'+esc(g.label)+' · '+BANNERS[pool(r.gacha_type)]+'\n'+r.time+' (server time)\n\nUID '+uid+' · '+(page+1)+' / '+hits.length+
   '\n<i>Saved records only; missing pulls affect pity.</i>\nArtwork: Enka.Network / HoYoverse';
  const nav=[];
  if(page)nav.push(btn('← Newer','c:'+uid+':'+id+':'+(page-1)+':'+rank));
  if(page+1<hits.length)nav.push(btn('Older →','c:'+uid+':'+id+':'+(page+1)+':'+rank));
  const filters=[...(g.five?[btn((rank==='5'?'● ':'')+'5★ · '+g.five,'c:'+uid+':'+id+':0:5')]:[]),...(g.four?[btn((rank==='4'?'● ':'')+'4★ · '+g.four,'c:'+uid+':'+id+':0:4')]:[])];
  const reply_markup=kb([...(nav.length?[nav]:[]),filters,[btn('← '+g.label,'p:'+uid+':'+id)],[btn('History & patches','history')]]);
  const art=artMap[r.item_id||String(itemIds[r.name]??'')],target=this.context.getStore()?.message;
  if(art){
   const key='photo:'+art.icon;
   for(const photo of [...new Set([this.store.getMeta(key),'https://enka.network'+art.icon,art.fallback?'https://enka.network'+art.fallback:null].filter(Boolean))]){
    try{
     const sent=target?.photo&&String(target.chat.id)===String(chat)
      ?await this.tg.call('editMessageMedia',{chat_id:chat,message_id:target.message_id,media:{type:'photo',media:photo,caption,parse_mode:'HTML'},reply_markup})
      :await this.tg.call('sendPhoto',{chat_id:chat,photo,caption,parse_mode:'HTML',reply_markup});
     if(sent?.photo?.at(-1)?.file_id)this.store.setMeta(key,sent.photo.at(-1).file_id);return sent;
    }catch(e){if(e.notModified)return;if(e.code!==400)throw e;}
   }
  }
  return this.tg.message(chat,caption+'\nArtwork currently unavailable.',{parse_mode:'HTML',reply_markup});
 }
 async achievements(chat,owner){
  const a=this.account(owner),rows=this.store.achievementRows(owner,a.uid),done=rows.filter(r=>r.status>=2).length,total=this.store.achievementTotal(owner,a.uid);this.store.setUI(owner,{});
  return this.visual(chat,'<b>✩ YOUR ACHIEVEMENT JOURNAL</b>\n<b>'+done+'</b> marked complete'+(total?' · HoYoLAB total: '+total.total:'')+'\n\nSearch for your next goal or browse a category.\n<i>Individual completion is manual or imported.</i>',
   kb([[btn('Browse categories','ag:0'),btn('⌕ Search','asearch')],[btn('Import UIAF','aimport'),btn('Export UIAF','aexport')],[btn('Accounts','accounts')],home]),
   {type:'dashboard',title:'Little victories. Big adventures.',subtitle:'A journal for the things you discover along the way.',metrics:[{value:done,label:'MARKED COMPLETE'},{value:catalogue.items.length,label:'IN THE CATALOGUE'},{value:catalogue.categories.length,label:'CATEGORIES'},{value:total?.total??'—',label:'HOYOLAB TOTAL',color:'#bfa8e7'}],uid:a.uid,footer:'Your checklist and the HoYoLAB total are tracked separately.',accent:'#bfa8e7'});
 }
 async categories(chat,owner,page){this.account(owner);const pages=Math.ceil(catalogue.categories.length/10);if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('Invalid category page.');const nav=[];if(page)nav.push(btn('← Previous',`ag:${page-1}`));if(page+1<pages)nav.push(btn('Next →',`ag:${page+1}`));return this.say(chat,`<b>✩ CHOOSE A CHAPTER</b>\nPage ${page+1}/${pages}`,kb([...catalogue.categories.slice(page*10,page*10+10).map(g=>[btn(g.name.slice(0,60),`al:${g.id}:0:all`)]),...(nav.length?[nav]:[]),[btn('← Journal','achievements')]]));}
 async achievementList(chat,owner,category,page,filter='all'){const a=this.account(owner),g=catalogue.categories.find(g=>g.id===category);if(!g||!['all','todo'].includes(filter))throw new UserError('Invalid achievement category.');const done=new Set(this.store.achievementRows(owner,a.uid).filter(x=>x.status>=2).map(x=>x.id)),list=catalogue.items.filter(x=>x.category===category&&(filter!=='todo'||!done.has(x.id))),pages=Math.max(1,Math.ceil(list.length/8));if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('Invalid achievement page.');const nav=[];if(page)nav.push(btn('← Previous',`al:${category}:${page-1}:${filter}`));if(page+1<pages)nav.push(btn('Next →',`al:${category}:${page+1}:${filter}`));return this.say(chat,`<b>✩ ${esc(g.name)}</b>\n${filter==='todo'?'Not marked complete':'All achievements'} · Page ${page+1}/${pages}\n\nTap an achievement for details.`,kb([...list.slice(page*8,page*8+8).map(x=>[btn(`${done.has(x.id)?'✓':'○'} ${x.name}`.slice(0,60),`ad:${x.id}`)]),...(nav.length?[nav]:[]),[btn(filter==='todo'?'Show all':'Show unmarked',`al:${category}:0:${filter==='todo'?'all':'todo'}`)],[btn('← Categories','ag:0')]]));}
 async achievement(chat,owner,id){const a=this.account(owner),item=achievementById.get(id);if(!item)throw new UserError('This achievement is not in the current catalogue.');const row=this.store.achievementRows(owner,a.uid).find(r=>r.id===id),done=row?.status>=2;return this.say(chat,`<b>${done?'✓':'✩'} ${esc(item.name)}</b>\n\n${esc(item.description)}\n\n${item.reward} Primogems · Added in ${esc(item.version)}\nID ${id}\n\n${done?'Marked complete':'Not marked complete'}${row?` · ${row.source==='uiaf'?'UIAF import':'your checklist'}`:''}`,kb([[btn(done?'Mark incomplete':'✓ Mark complete',`am:${id}:${done?'0':'1'}`)],[btn('← Category',`al:${item.category}:0:all`),btn('Journal','achievements')]]));}
 async search(chat,owner,query){this.account(owner);const q=query.trim().toLowerCase().slice(0,100);if(q.length<2)throw new UserError('Search using at least two characters.');const matches=catalogue.items.filter(a=>String(a.id)===q||a.name.toLowerCase().includes(q)||a.description.toLowerCase().includes(q));return this.say(chat,`<b>⌕ ACHIEVEMENT SEARCH</b>\n${matches.length} result${matches.length===1?'':'s'} for “${esc(q)}”${matches.length>12?'\nShowing the first 12. Narrow your search for more.':''}`,kb([...matches.slice(0,12).map(a=>[btn(a.name.slice(0,60),`ad:${a.id}`)]),[btn('Search again','asearch'),btn('Journal','achievements')]]));}
}
