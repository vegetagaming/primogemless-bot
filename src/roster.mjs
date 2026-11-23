import {UserError} from './history.mjs';
import {weaponCatalogue,weaponById,parseManualWeapon,equippedFiveStars} from './roster-data.mjs';

const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const btn=(text,callback_data)=>({text,callback_data});
const kb=inline_keyboard=>({inline_keyboard});
const short=(s,n=20)=>s.length>n?s.slice(0,n-1)+'…':s;
const date=s=>s.slice(0,16).replace('T',' ')+' UTC';
const chunks=buttons=>Array.from({length:Math.ceil(buttons.length/3)},(_,i)=>buttons.slice(i*3,i*3+3));
const routes=new Set(['oc','od','ow','owe','owm','orf','wa','was','wasrch','wedit','wdel','wdelok','oexport']);
function pageOf(rows,page,size=9){const pages=Math.max(1,Math.ceil(rows.length/size));if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('That roster page is unavailable.');return {visible:rows.slice(page*size,page*size+size),pages};}
function nav(page,pages,route){const row=[];if(page)row.push(btn('← Previous',route(page-1)));if(page+1<pages)row.push(btn('Next →',route(page+1)));return row.length?[row]:[];}
export class Roster{
 constructor(app){this.app=app;this.store=app.store;this.refreshing=new Set();this.refreshed=new Map();}
 handles(action){return routes.has(action);}
 async route(chat,owner,b){
  const [,uid,arg,page]=b;
  switch(b[0]){
   case 'oc':return this.characters(chat,owner,uid,arg??'a',Number(page??0));
   case 'od':return this.character(chat,owner,uid,arg,b[4]??'a',Number(page??0));
   case 'ow':return this.weapons(chat,owner,uid,arg??'e',Number(page??0));
   case 'owe':return this.equipped(chat,owner,uid,arg,Number(page??0));
   case 'owm':return this.manual(chat,owner,uid,Number(arg));
   case 'orf':return this.refresh(chat,owner,uid);
   case 'wa':return this.picker(chat,owner,uid,arg==='clear'?0:Number(arg??0),arg==='clear'?'':null);
   case 'was':return this.edit(chat,owner,uid,arg);
   case 'wasrch':this.app.account(owner,uid);this.store.setUI(owner,{rosterSearchUid:uid});return this.app.say(chat,'<b>Find a 5★ weapon</b>\nSend part of its name.',kb([[btn('Cancel','wa:'+uid+':0')]]));
   case 'wedit':{const r=this.manualRow(owner,uid,Number(arg));return this.edit(chat,owner,uid,r.weapon_id,r.id);}
   case 'wdel':{const r=this.manualRow(owner,uid,Number(arg));return this.app.say(chat,'Remove your manual entry for <b>'+esc(weaponById.get(r.weapon_id).name)+'</b>?\n×'+r.quantity+' · R'+r.refinement+' · Level '+r.level,kb([[btn('Remove entry','wdelok:'+uid+':'+r.id),btn('Cancel','owm:'+uid+':'+r.id)]]));}
   case 'wdelok':this.app.account(owner,uid);this.store.removeManualWeapon(owner,uid,Number(arg));return this.weapons(chat,owner,uid,'m',0);
   case 'oexport':return this.export(chat,owner,uid);
  }
 }
 itemButton(text,route,id){return {...btn(short(text,27),route),ui_icon:this.app.art?.emoji(id)};}
 tabs(uid,selected){return [btn((selected==='c'?'● ':'')+'Characters','oc:'+uid+':a:0'),btn((selected==='w'?'● ':'')+'5★ Weapons','ow:'+uid+':e:0')];}
 footer(uid){return [[btn('Refresh roster','orf:'+uid),btn('Export roster','oexport:'+uid)],[btn('History','history'),btn('⌂ Home','start')]];}
 async characters(chat,owner,uid=null,rank='a',page=0){
  const a=this.app.account(owner,uid);uid=a.uid;if(!['a','4','5'].includes(rank))throw new UserError('Choose all, 5★ or 4★ characters.');this.store.setUI(owner,{});
  const snapshot=this.store.roster(owner,uid),all=snapshot?.characters??[],list=all.filter(c=>rank==='a'||String(c.rank)===rank).sort((a,b)=>b.rank-a.rank||b.level-a.level||a.name.localeCompare(b.name)),{visible,pages}=pageOf(list,page);
  const rows=chunks(visible.map(c=>this.itemButton(short(c.name,18)+' · C'+c.constellation,'od:'+uid+':'+c.id+':'+page+':'+rank,c.id)));
  return this.app.visual(chat,'<b>Your owned characters</b>\nUID '+uid+' · '+all.length+' characters\n\n'+(snapshot?'HoYoLAB snapshot: '+date(snapshot.checked_at)+'\nConstellations come from your roster.':'Connect HoYoLAB, then tap Refresh roster to fetch your characters and constellation levels.\nManual unequipped weapons can be added now.'),kb([
   this.tabs(uid,'c'),[btn('All','oc:'+uid+':a:0'),btn('5★','oc:'+uid+':5:0'),btn('4★','oc:'+uid+':4:0')],...rows,...nav(page,pages,p=>'oc:'+uid+':'+rank+':'+p),...(!this.store.connection(owner)?[[btn('Connect HoYoLAB','login')]]:[]),...this.footer(uid)
  ]),{type:'ownedgrid',title:'Your companions.',subtitle:snapshot?'Owned characters  /  constellation & level':'Connect to discover your roster.',items:visible.map(c=>({...c,rank:String(c.rank),badge:'C'+c.constellation,secondary:'LEVEL '+c.level,detail:'CONSTELLATION'})),page,pages,kind:'c',empty:'No roster saved for this selection.'});
 }
 async character(chat,owner,uid,id,rank='a',page=0){
  this.app.account(owner,uid);const s=this.store.roster(owner,uid),c=s?.characters.find(c=>c.id===id);if(!c)throw new UserError('Refresh your roster to find this character.');
  const five=c.weapon?.rank===5?c.weapon:null;
  return this.app.visual(chat,'<b>'+esc(c.name)+' · C'+c.constellation+'</b>\n'+c.rank+'★ · Level '+c.level+'\n'+(five?'\nEquipped: '+esc(five.name)+' · R'+five.refinement+' · Lv. '+five.level+'\n':'')+'\nHoYoLAB snapshot: '+date(s.checked_at),kb([...(five?[[btn('View 5★ weapon','owe:'+uid+':'+id+':0')]]:[]),[btn('← Characters','oc:'+uid+':'+rank+':'+page)],...this.artControls(owner,id)]),{type:'ownedDetail',id:c.id,name:c.name,rank:String(c.rank),title:'OWNED CHARACTER',badge:'C'+c.constellation,badgeLabel:'CONSTELLATION',metrics:[{value:c.level,label:'LEVEL'},{value:c.rank+' STAR',label:'RARITY'}],footer:'HoYoLAB roster  /  '+date(s.checked_at)});
 }
 artControls(owner,id){return String(owner)===this.app.ownerId&&this.app.art?[[btn('Edit artwork / emoji','artitem:'+id)]]:[];}
 async weapons(chat,owner,uid,mode='e',page=0){
  this.app.account(owner,uid);if(!['e','m'].includes(mode))throw new UserError('Choose equipped or manual weapons.');this.store.setUI(owner,{});
  const s=this.store.roster(owner,uid),list=mode==='e'?equippedFiveStars(s?.characters??[]):this.store.manualWeapons(owner,uid).map(r=>({...r,recordId:r.id,id:r.weapon_id,name:weaponById.get(r.weapon_id).name,rank:5})),{visible,pages}=pageOf(list,page);
  const copies=list.reduce((sum,w)=>sum+w.quantity,0),rows=chunks(visible.map(w=>this.itemButton(short(w.name,17)+' · R'+w.refinement,mode==='e'?'owe:'+uid+':'+w.holderId+':'+page:'owm:'+uid+':'+w.recordId,w.id)));
  const explanation=mode==='e'?(s?'HoYoLAB snapshot: '+date(s.checked_at)+'. Only equipped weapons are available here.':'Connect HoYoLAB and refresh your roster to load equipped weapons.'):'Entered by you. Update or remove an entry when you equip, refine or consume a copy. These entries are not combined with equipped counts.';
  return this.app.visual(chat,'<b>5★ weapons · '+(mode==='e'?'Equipped':'Unequipped (manual)')+'</b>\n'+copies+' '+(mode==='e'?'equipped':'manually recorded')+' copies · UID '+uid+'\n\n'+explanation,kb([this.tabs(uid,'w'),[btn((mode==='e'?'● ':'')+'Equipped','ow:'+uid+':e:0'),btn((mode==='m'?'● ':'')+'Unequipped (manual)','ow:'+uid+':m:0')],...rows,...nav(page,pages,p=>'ow:'+uid+':'+mode+':'+p),[btn('Add unequipped weapon','wa:'+uid+':0')],...this.footer(uid)]),{type:'ownedgrid',title:mode==='e'?'Armed for adventure.':'Your weapon reserve.',subtitle:mode==='e'?'Equipped 5-star weapons  /  HoYoLAB snapshot':'Unequipped 5-star weapons  /  manually recorded',items:visible.map(w=>({...w,rank:'5',badge:'R'+w.refinement,secondary:'LEVEL '+w.level+'  /  ×'+w.quantity,detail:mode==='e'?short(w.holder,24):'MANUAL ENTRY'})),page,pages,kind:'w',empty:mode==='e'?'No equipped 5-star weapons saved.':'Add your first unequipped 5-star weapon.'});
 }
 async equipped(chat,owner,uid,holder,page=0){
  this.app.account(owner,uid);const s=this.store.roster(owner,uid),w=equippedFiveStars(s?.characters??[]).find(w=>w.holderId===holder);if(!w)throw new UserError('That equipped 5★ weapon is no longer in the saved roster.');
  return this.weaponCard(chat,owner,uid,w,'Equipped by '+w.holder,'HoYoLAB snapshot: '+date(s.checked_at),[[btn('← Equipped weapons','ow:'+uid+':e:'+page)]]);
 }
 manualRow(owner,uid,id){this.app.account(owner,uid);const r=this.store.manualWeapons(owner,uid).find(x=>x.id===id);if(!r)throw new UserError('That manual weapon is unavailable.');return r;}
 async manual(chat,owner,uid,id){const r=this.manualRow(owner,uid,id),w={...r,id:r.weapon_id,name:weaponById.get(r.weapon_id).name};return this.weaponCard(chat,owner,uid,w,'Unequipped · manual entry','Last edited: '+date(r.updated_at),[[btn('Edit quantity / R / level','wedit:'+uid+':'+id)],[btn('Remove entry','wdel:'+uid+':'+id),btn('← Unequipped','ow:'+uid+':m:0')]]);}
 async weaponCard(chat,owner,uid,w,where,when,buttons){return this.app.visual(chat,'<b>5★ '+esc(w.name)+'</b>\nR'+w.refinement+' · Level '+w.level+' · ×'+w.quantity+'\n\n'+esc(where)+'\n'+when,kb([...buttons,...this.artControls(owner,w.id)]),{type:'ownedDetail',id:w.id,name:w.name,rank:'5',title:'5-STAR WEAPON',badge:'R'+w.refinement,badgeLabel:'REFINEMENT',metrics:[{value:w.level,label:'LEVEL'},{value:'×'+w.quantity,label:'COPIES'}],subtitle:where,footer:when});}
 async picker(chat,owner,uid,page=0,query=null){
  this.app.account(owner,uid);const ui=this.store.getUI(owner);query=query??(ui.weaponQueryUid===uid?ui.weaponQuery:'')??'';this.store.setUI(owner,{weaponQueryUid:uid,weaponQuery:query});
  const list=weaponCatalogue.filter(w=>w.name.toLowerCase().includes(query.toLowerCase())),{visible,pages}=pageOf(list,page);
  return this.app.say(chat,'<b>Add an unequipped 5★ weapon</b>\nChoose a weapon · '+list.length+' matches\nPage '+(page+1)+' / '+pages+'\n\nOnly add copies you currently own and have not equipped.',kb([...chunks(visible.map(w=>this.itemButton(w.name,'was:'+uid+':'+w.id,w.id))),...nav(page,pages,p=>'wa:'+uid+':'+p),[btn('Search by name','wasrch:'+uid),btn('Clear search','wa:'+uid+':clear')],[btn('← Unequipped','ow:'+uid+':m:0')]]));
 }
 async edit(chat,owner,uid,weaponId,rowId=null){
  this.app.account(owner,uid);const w=weaponById.get(weaponId);if(!w)throw new UserError('Choose a 5★ weapon from the catalogue.');
  const old=rowId!==null?this.manualRow(owner,uid,rowId):null;this.store.setUI(owner,{manualWeapon:{uid,weaponId,rowId}});
  return this.app.say(chat,'<b>'+esc(w.name)+'</b>\n\nSend <b>quantity refinement level</b>:\n<code>2 1 90</code> = two copies, each R1 and level 90.\n'+(old?'\nCurrent: <code>'+old.quantity+' '+old.refinement+' '+old.level+'</code>\n':'')+'\nQuantity replaces the saved count for this weapon, refinement and level. Use separate entries for copies with different refinements or levels.',kb([[btn('Cancel','ow:'+uid+':m:0')]]));
 }
 async accept(chat,owner,text){const state=this.store.getUI(owner);if(state.rosterSearchUid)return this.picker(chat,owner,state.rosterSearchUid,0,text.trim().slice(0,100));const pending=state.manualWeapon;if(!pending)throw new UserError('Choose a weapon first.');const value=parseManualWeapon(pending.weaponId,text),id=this.store.saveManualWeapon(owner,pending.uid,value,pending.rowId);this.store.setUI(owner,{});return this.manual(chat,owner,pending.uid,id);}
 async refresh(chat,owner,uid){
  this.app.account(owner,uid);const connection=this.store.connection(owner,true);if(!connection||!this.app.vault||!this.app.hoyo)throw new UserError('Open /login and connect HoYoLAB before refreshing your roster.');
  const key=owner+':'+uid;if(this.refreshing.has(key)||Date.now()-(this.refreshed.get(key)??0)<30000)throw new UserError('Please wait 30 seconds before refreshing this roster again.');
  this.refreshing.add(key);this.refreshed.set(key,Date.now());if(this.refreshed.size>10000)for(const [k,v] of this.refreshed)if(Date.now()-v>60000)this.refreshed.delete(k);
  try{
   const cookies=this.app.vault.load(owner),roles=await this.app.hoyo.roles(cookies),role=roles.find(r=>r.uid===uid);if(!role)throw new UserError('The connected HoYoLAB login does not own this Genshin UID.');
   if(this.store.connection(owner,true)?.secret!==connection.secret)throw new UserError('The connection changed. Open your roster again.');
   const roster=await this.app.hoyo.roster(cookies,role);
   if(this.store.connection(owner,true)?.secret!==connection.secret)throw new UserError('The connection changed. Your roster was not saved.');
   this.store.saveRoster(owner,uid,roster);return this.characters(chat,owner,uid);
  }finally{this.refreshing.delete(key);}
 }
 async export(chat,owner,uid){this.app.account(owner,uid);const data={format:'primogemless-roster-v1',uid,exported_at:new Date().toISOString(),hoyolab:this.store.roster(owner,uid),unequipped_manual:this.store.manualWeapons(owner,uid).map(({id,...w})=>w)};return this.app.tg.document(chat,Buffer.from(JSON.stringify(data,null,2)),'roster-'+uid+'.json','Roster snapshot and your manually recorded unequipped weapons. This is a reference backup, not a UIGF wish file.');}
}
