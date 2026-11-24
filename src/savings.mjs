import {UserError} from './history.mjs';
export const CURRENCIES=[['primogems','Primogems'],['crystals','Genesis Crystals'],['intertwined','Intertwined Fates'],['acquaint','Acquaint Fates']];
const PROFILE_FIELDS=[['primogems','Primogems','💎'],['crystals','Genesis Crystals','💠'],['acquaint','Acquaint Fates','🔵'],['intertwined','Intertwined Fates','🌠']];
export function balances(value){const out={};for(const [key]of CURRENCIES){const n=value?.[key];if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw new UserError('Balances must be whole numbers from 0 to 1,000,000,000.');out[key]=n;}return out;}
export function parseBalances(text){const parts=text.trim().split(/\s+/);if(parts.length!==4||parts.some(x=>!/^\d+$/.test(x)))throw new UserError('Send four whole numbers in this order: Primogems, Crystals, Intertwined Fates, Acquaint Fates. Example: 12000 300 25 10');return balances(Object.fromEntries(CURRENCIES.map(([key],i)=>[key,Number(parts[i])])));}
export function wishBudget(value){const b=balances(value);return {event:b.intertwined+Math.floor(b.primogems/160),primogemWishes:Math.floor(b.primogems/160),remainingPrimogems:b.primogems%160,standardTickets:b.acquaint,withCrystals:b.intertwined+Math.floor((b.primogems+b.crystals)/160)};}
export function ledgerPeriods(now=Date.now(),count=3){const local=new Date(now+8*3600000);return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-i,1));return d.toISOString().slice(0,7);});}
export function normalizeDiary(data,uid,region,period){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||String(data?.uid)!==String(uid)||data.region!==region||Number(data.data_month)!==Number(period.slice(5)))throw new UserError('HoYoLAB returned diary data for a different account or month.');
 const n=value=>{if(!Number.isSafeInteger(value)||value<0||value>1000000000)throw new UserError('HoYoLAB returned invalid diary totals.');return value;};
 return {period,earnedPrimogems:n(data.month_data?.current_primogems),earnedMora:n(data.month_data?.current_mora),todayPrimogems:n(data.day_data?.current_primogems??0),categories:(data.month_data?.group_by??[]).slice(0,30).map(c=>({name:String(c.action??'Other').replace(/[\u0000-\u001f]/g,'').slice(0,100),amount:n(c.num)}))};
}
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const fmt=n=>Number(n).toLocaleString('en-US');
const signed=n=>(n>0?'+':'')+fmt(n);
const button=(text,callback_data)=>({text,callback_data});
const keyboard=rows=>({inline_keyboard:rows});
const savedAt=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Tashkent',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' UTC+5';
export class Savings{
 constructor(app){this.app=app;this.store=app.store;}
 requireOwner(owner){if(!this.app.isOwner(owner))throw new UserError('My Game Profile is available only to the bot owner for now.');}
 async show(chat,owner){
  this.requireOwner(owner);
  const a=this.app.account(owner),history=this.store.savingsRows(owner,a.uid,2),current=history[0],previous=history[1];this.store.setUI(owner,{});
  const fields=current?PROFILE_FIELDS.map(([key,label,symbol])=>button(symbol+' '+label+' · '+fmt(current[key]),'savfield:'+key)):[];
  const keys=keyboard([...(current?[fields.slice(0,2),fields.slice(2)]:[]),[button(current?'Update all balances':'Save first balances','savedit')],...(this.app.icons?[[button('Set currency emojis','currencyicons')]]:[]),[button('Balance history','savlog:0'),button('Earned Primogems','primogems')],[button('Export balances','savexport'),button('Switch account','accounts')],[button('← Wish History','history'),button('⌂ Home','start')]]);
  if(!current)return this.app.visual(chat,'<b>My Game Profile</b>\nUID '+a.uid+'\n\nSave your current balances:\n💎 Primogems\n💠 Genesis Crystals (top-up)\n🔵 Acquaint Fates — standard pulls\n🌠 Intertwined Fates — event pulls\n\nEach update keeps a dated snapshot.\n<i>Manual balances · HoYoLAB income and wish syncing do not change them.</i>',keys,{type:'dashboard',title:'Your game. Your savings.',subtitle:'Record your current balances for this Genshin account.',metrics:PROFILE_FIELDS.map(([,label])=>({value:'—',label:label.toUpperCase()})),footer:'Owner preview  /  Save your first balance to begin.',uid:a.uid});
  const budget=wishBudget(current),delta=previous?'\n\n<b>Change since previous save</b>\n'+PROFILE_FIELDS.map(([k,label,symbol])=>symbol+' '+label+': '+signed(current[k]-previous[k])).join('\n'):'';
  const amounts=PROFILE_FIELDS.map(([key,label,symbol])=>symbol+' '+label+': <b>'+fmt(current[key])+'</b>').join('\n');
  return this.app.visual(chat,'<b>My Game Profile</b> · UID '+a.uid+'\nSaved '+savedAt(current.recorded_at)+'\n\n'+amounts+'\n\n<b>'+budget.event+' event wishes</b> with saved Primogems.\n'+fmt(budget.standardTickets)+' standard pulls kept separately.\n'+(current.crystals?'With all crystals converted: '+fmt(budget.withCrystals)+' event wishes.\n':'')+'<i>Manually saved · tap a balance to update it.</i>'+delta,keys,
   {type:'dashboard',title:'Your game. Your savings.',subtitle:'Your latest manually recorded balances.',metrics:PROFILE_FIELDS.map(([key,label])=>({value:fmt(current[key]),label:label.toUpperCase()})),footer:'Event wish budget: '+fmt(budget.event)+'  /  Standard pulls: '+fmt(budget.standardTickets),uid:a.uid,accent:'#a8baf1'});
 }
 async emojiSettings(chat,owner){this.requireOwner(owner);this.app.requireIconOwner(owner);this.store.setUI(owner,{});return this.app.say(chat,'<b>Currency emojis</b>\n\nChoose a currency, then send one premium or regular emoji. It will appear beside that currency in profile text and buttons.\n\nAcquaint Fates = standard pulls\nIntertwined Fates = event pulls',keyboard([...PROFILE_FIELDS.map(([key,label,symbol])=>[button(symbol+' '+label,'i:currency_'+key)]),[button('← My Game Profile','savings')]]));}
 async edit(chat,owner){this.requireOwner(owner);const a=this.app.account(owner);this.store.setUI(owner,{savingsUid:a.uid});return this.app.say(chat,'<b>Save your current balances</b>\nUID '+a.uid+'\n\nSend four numbers in this order:\n\n💎 Primogems\n💠 Genesis Crystals\n🌠 Intertwined Fates (event)\n🔵 Acquaint Fates (standard)\n\nExample: <code>12000 300 25 10</code>\n\nUse 0 for a currency you do not have. These replace your balances; earlier snapshots stay saved.',keyboard([[button('Cancel','savings')]]));}
 async editField(chat,owner,key){
  this.requireOwner(owner);const field=PROFILE_FIELDS.find(([name])=>name===key);if(!field)throw new UserError('Choose one of the four balances in My Game Profile.');
  const a=this.app.account(owner),current=this.store.savingsRows(owner,a.uid,1)[0];if(!current)return this.edit(chat,owner);
  this.store.setUI(owner,{savingsUid:a.uid,savingsField:key});
  return this.app.say(chat,'<b>'+field[2]+' Update '+field[1]+'</b>\nUID '+a.uid+'\n\nCurrently saved: <b>'+fmt(current[key])+'</b>\nSend your new total as one whole number.\n\nThis replaces the saved amount; it does not add to it.',keyboard([[button('Cancel','savings')]]));
 }
 async accept(chat,owner,text){
  this.requireOwner(owner);const {savingsUid:uid,savingsField:key}=this.store.getUI(owner);if(!uid)throw new UserError('Open My Game Profile and choose a balance first.');this.app.account(owner,uid);
  let value;
  if(key){
   if(!PROFILE_FIELDS.some(([name])=>name===key)||!/^\d+$/.test(text.trim()))throw new UserError('Send one whole number from 0 to 1,000,000,000.');
   const current=this.store.savingsRows(owner,uid,1)[0];if(!current)throw new UserError('Save all four balances first.');value=balances({...current,[key]:Number(text.trim())});
  }else value=parseBalances(text);
  this.store.saveSavings(owner,uid,value);this.store.select(owner,uid);this.store.setUI(owner,{});return this.show(chat,owner);
 }
 async log(chat,owner,page=0){this.requireOwner(owner);const a=this.app.account(owner),all=this.store.savingsRows(owner,a.uid,5000),pages=Math.max(1,Math.ceil(all.length/5));if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('Invalid savings page.');const rows=all.slice(page*5,page*5+5),nav=[];if(page)nav.push(button('← Newer','savlog:'+(page-1)));if(page+1<pages)nav.push(button('Older →','savlog:'+(page+1)));return this.app.say(chat,'<b>Balance history</b>\nUID '+a.uid+' · Page '+(page+1)+' / '+pages+'\n\n'+(rows.length?rows.map(r=>'<b>'+savedAt(r.recorded_at)+'</b>\n'+fmt(r.primogems)+' Primogems · '+fmt(r.crystals)+' Crystals\n'+fmt(r.acquaint)+' standard pulls · '+fmt(r.intertwined)+' event pulls').join('\n\n'):'No balances saved yet.'),keyboard([...(nav.length?[nav]:[]),[button('← My Game Profile','savings')]]));}
 async export(chat,owner){this.requireOwner(owner);const a=this.app.account(owner),snapshots=this.store.savingsRows(owner,a.uid,5000).map(({id,owner:discardOwner,uid:discardUid,...row})=>row);return this.app.tg.document(chat,Buffer.from(JSON.stringify({version:1,uid:a.uid,snapshots,diary:this.store.diaryRows(owner,a.uid)},null,2)),'Primogemless-savings.json','Your manual balances and saved HoYoLAB income summaries.');}
 async diary(chat,owner,period=ledgerPeriods()[0],refresh=false){
  const a=this.store.selected(owner);
  if(!a)return this.app.say(chat,'<b>Earned Primogems</b>\n\nConnect your HoYoLAB account to load available monthly Primogem income.',keyboard([[button('Connect HoYoLAB','login')],[button('⌂ Home','start')]]));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new UserError('Invalid diary month.');
  let record=this.store.diaryRows(owner,a.uid).find(x=>x.period===period),notice='';
  const session=this.store.connection(owner,true);
  if((refresh||!record)&&session&&this.app.vault&&this.app.hoyo?.diary){
   try{
    const cookies=this.app.vault.load(owner),roles=await this.app.hoyo.roles(cookies),role=roles.find(x=>x.uid===a.uid);if(!role)throw new Error('Account not linked');
    const summary=await this.app.hoyo.diary(cookies,role,period);
    if(this.store.connection(owner,true)?.secret!==session.secret)throw new Error('Disconnected');
    this.store.saveDiary(owner,a.uid,summary);record=this.store.diaryRows(owner,a.uid).find(x=>x.period===period);
   }catch{notice='\n\nHoYoLAB could not supply this month. Try reconnecting or check again later.';}
  }
  const periods=[...new Set([...ledgerPeriods(),...this.store.diaryRows(owner,a.uid).map(x=>x.period)])].sort().reverse().slice(0,12),months=[];for(let i=0;i<periods.length;i+=3)months.push(periods.slice(i,i+3).map(p=>button(p,'diary:'+p)));
  const text='<b>Earned Primogems · '+period+'</b>\nHoYoLAB Traveler’s Diary · UID '+a.uid+'\n\n'+(record?'<b>'+fmt(record.earnedPrimogems)+'</b> Primogems earned\n'+fmt(record.earnedMora)+' Mora earned\n\n'+record.categories.map(x=>esc(x.name)+': '+fmt(x.amount)).join('\n'):session?'No summary saved for this month.':'Connect HoYoLAB to request its income summary.')+'\n\n<i>This is recorded income, not your current balance. Crystals, fates and spending are not a complete wallet here.</i>'+notice;
  return this.app.say(chat,text,keyboard([...months,[button('↻ Refresh income','df:'+period),button('HoYoLAB setup','login')],[...(this.app.isOwner(owner)?[button('My Game Profile','savings')]:[]),button('Accounts','accounts')],[button('⌂ Home','start')]]));
 }
}
