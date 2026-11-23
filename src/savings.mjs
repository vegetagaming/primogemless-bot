import {UserError} from './history.mjs';
export const CURRENCIES=[['primogems','Primogems'],['crystals','Genesis Crystals'],['intertwined','Intertwined Fates'],['acquaint','Acquaint Fates']];
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
 async show(chat,owner){
  const a=this.app.account(owner),history=this.store.savingsRows(owner,a.uid,2),current=history[0],previous=history[1];this.store.setUI(owner,{});
  const keys=keyboard([[button(current?'Update balances':'Save first balances','savedit')],[button('Balance history','savlog:0'),button('Traveler’s Diary','diary:'+ledgerPeriods()[0])],[button('Export savings','savexport'),button('← History','history')]]);
  if(!current)return this.app.visual(chat,'<b>Your savings start here</b>\n\nSave your Primogems, Genesis Crystals, Intertwined Fates and Acquaint Fates. Every changed balance becomes a dated snapshot.\n\n<i>Balances are entered by you. HoYoLAB income does not automatically change your wallet.</i>',keys,{type:'dashboard',title:'Save for your next wish.',subtitle:'Your currencies. Your next character.',metrics:CURRENCIES.map(([,label])=>({value:'—',label:label.toUpperCase()})),footer:'Record a balance once, then update it whenever you want.',uid:a.uid});
  const budget=wishBudget(current),delta=previous?'\n\n<b>Since your previous save</b>\n'+CURRENCIES.map(([k,label])=>label+': '+signed(current[k]-previous[k])).join('\n'):'';
  return this.app.visual(chat,'<b>Your saved balances</b>\n'+savedAt(current.recorded_at)+'\n\n<b>'+budget.event+' event wishes</b> if you spend all saved Primogems on event wishes.\n'+fmt(budget.standardTickets)+' standard tickets kept separately.\n'+(current.crystals?'With all crystals converted: '+fmt(budget.withCrystals)+' event wishes.\n':'')+'<i>No currency is converted or spent by this bot.</i>'+delta,keys,
   {type:'dashboard',title:'Saving for something special.',subtitle:'Your latest manually recorded balances.',metrics:CURRENCIES.map(([key,label])=>({value:fmt(current[key]),label:label.toUpperCase()})),footer:'Event wish budget: '+fmt(budget.event)+'  /  Standard tickets: '+fmt(budget.standardTickets),uid:a.uid,accent:'#a8baf1'});
 }
 async edit(chat,owner){const a=this.app.account(owner);this.store.setUI(owner,{savingsUid:a.uid});return this.app.say(chat,'<b>Save your current balances</b>\n\nSend four numbers, separated by spaces:\n\n<code>Primogems  Crystals  Event fates  Standard fates</code>\n\nExample: <code>12000 300 25 10</code>\nUse 0 for a currency you do not have.\n\nThese replace your current balances; earlier snapshots stay saved.',keyboard([[button('Cancel','savings')]]));}
 async accept(chat,owner,text){const uid=this.store.getUI(owner).savingsUid;this.app.account(owner,uid);const value=parseBalances(text);this.store.saveSavings(owner,uid,value);this.store.select(owner,uid);this.store.setUI(owner,{});return this.show(chat,owner);}
 async log(chat,owner,page=0){const a=this.app.account(owner),all=this.store.savingsRows(owner,a.uid,5000),pages=Math.max(1,Math.ceil(all.length/5));if(!Number.isInteger(page)||page<0||page>=pages)throw new UserError('Invalid savings page.');const rows=all.slice(page*5,page*5+5),nav=[];if(page)nav.push(button('← Newer','savlog:'+(page-1)));if(page+1<pages)nav.push(button('Older →','savlog:'+(page+1)));return this.app.say(chat,'<b>Balance history</b>\nPage '+(page+1)+' / '+pages+'\n\n'+(rows.length?rows.map(r=>'<b>'+savedAt(r.recorded_at)+'</b>\n'+fmt(r.primogems)+' Primogems · '+fmt(r.crystals)+' Crystals\n'+fmt(r.intertwined)+' event fates · '+fmt(r.acquaint)+' standard fates').join('\n\n'):'No balances saved yet.'),keyboard([...(nav.length?[nav]:[]),[button('← Savings','savings')]]));}
 async export(chat,owner){const a=this.app.account(owner),snapshots=this.store.savingsRows(owner,a.uid,5000).map(({id,owner:discardOwner,uid:discardUid,...row})=>row);return this.app.tg.document(chat,Buffer.from(JSON.stringify({version:1,uid:a.uid,snapshots,diary:this.store.diaryRows(owner,a.uid)},null,2)),'Primogemless-savings.json','Your manual balances and saved HoYoLAB income summaries.');}
 async diary(chat,owner,period=ledgerPeriods()[0],refresh=false){
  const a=this.store.selected(owner);
  if(!a)return this.app.say(chat,'<b>Earned Primogems</b>\n\nConnect your HoYoLAB account through Step 1 in Tutorial to load available monthly Primogem income.',keyboard([[button('1 · HoYoLAB tutorial','guide:hoyolab')],[button('⌂ Home','start')]]));
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
  const text='<b>Earned Primogems · '+period+'</b>\nHoYoLAB Traveler’s Diary · UID '+a.uid+'\n\n'+(record?'<b>'+fmt(record.earnedPrimogems)+'</b> Primogems earned\n'+fmt(record.earnedMora)+' Mora earned\n\n'+record.categories.map(x=>esc(x.name)+': '+fmt(x.amount)).join('\n'):session?'No summary saved for this month.':'Complete Step 1 in Tutorial to connect HoYoLAB and request its income summary.')+'\n\n<i>This is recorded income, not your current balance. Crystals, fates and spending are not a complete wallet here.</i>'+notice;
  return this.app.say(chat,text,keyboard([...months,[button('↻ Refresh income','df:'+period),button('HoYoLAB setup','guide:hoyolab')],[button('My saved balances','savings'),button('Accounts','accounts')],[button('⌂ Home','start')]]));
 }
}
