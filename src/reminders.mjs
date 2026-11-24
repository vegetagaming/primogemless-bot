import {UserError} from './history.mjs';
import {resetWindow,notesError} from './notes.mjs';
const btn=(text,callback_data)=>({text,callback_data}),kb=inline_keyboard=>({inline_keyboard});
const home=[btn('⌂ Home','start')];
export class Reminders {
 constructor(app,service){this.app=app;this.service=service;}
 async show(chat,owner,uid=null){
  const a=uid?this.app.account(owner,uid):this.app.store.selected(owner);
  if(!a)return this.app.say(chat,'<b>🔔 REMINDERS</b>\n\nConnect HoYoLAB to receive Daily Commission and Original Resin alerts. Each account has its own switches.',kb([[btn('Connect HoYoLAB','connect')],home]));
  const r=this.app.store.reminder(owner,a.uid),connected=this.app.store.connection(owner),n=r?.notes;
  const status=connected&&connected.status!=='expired'?'':'\n\n<b>Reconnect HoYoLAB to resume checks.</b>';
  const latest=n?`\n\n<b>Last checked</b> · ${new Date(r.checked_at).toISOString().slice(0,16).replace('T',' ')} UTC\n💧 Original Resin: <b>${n.resin} / ${n.maxResin}</b>\n📅 Daily Commissions: <b>${n.finished} / ${n.total}</b> · ${n.bonusClaimed?'bonus claimed':n.total===0?'not unlocked':'bonus unclaimed'}`:'\n\nEnable a reminder to check your current status.';
  const timing=r?`\nNext server reset: ${new Date(resetWindow(r.region).reset).toISOString().slice(0,16).replace('T',' ')} UTC`:'';
  return this.app.say(chat,`<b>🔔 REMINDERS</b>\nUID <code>${a.uid}</code>\n\n<b>📅 Daily Commissions</b> · ${r?.daily_enabled?'ON':'OFF'}\nOne alert in the last 2 hours before server reset if commissions or rewards are unfinished.\n\n<b>💧 Resin full</b> · ${r?.resin_enabled?'ON':'OFF'}\nOne alert when HoYoLAB reports Original Resin at its cap. Checks about every 10 minutes; spending resin rearms it.${latest}${timing}${status}${r?.error_code?'\n\n'+notesError(r.error_code):''}\n\n<i>Works with your PC off while the bot is online. HoYoLAB updates may be delayed.</i>`,kb([[btn(`📅 Daily: ${r?.daily_enabled?'ON → Off':'OFF → On'}`,`remset:${a.uid}:daily:${r?.daily_enabled?'0':'1'}`)],[btn(`💧 Resin: ${r?.resin_enabled?'ON → Off':'OFF → On'}`,`remset:${a.uid}:resin:${r?.resin_enabled?'0':'1'}`)],[btn('↻ Check now','remcheck:'+a.uid),btn('Change account','remaccounts')],[btn('Connection','login')],home]));
 }
 handles(action){return ['reminders','daily','resin','remset','remcheck','remaccounts'].includes(action);}
 async route(chat,owner,bits){
  const [action,uid,kind,value]=bits;
  if(action==='remaccounts')return this.app.say(chat,'<b>Choose reminder account</b>',kb([...this.app.store.accounts(owner).map(a=>[btn('UID '+a.uid,'reminders:'+a.uid)]),home]));
  if(action==='remset'||action==='remcheck'){
   this.app.account(owner,uid);if(!this.service)throw new UserError('Reminders are not available right now.');
   if(action==='remset'){if(!['daily','resin'].includes(kind)||!['0','1'].includes(value))throw new UserError('Choose a reminder switch.');await this.service.enable(owner,uid,kind,value==='1');}
   else{const r=this.app.store.reminder(owner,uid);if(!r||(!r.daily_enabled&&!r.resin_enabled))throw new UserError('Enable Daily or Resin first.');if(!r.checked_at||Date.now()-r.checked_at>=60000)await this.service.request(owner,uid);}
   return this.show(chat,owner,uid);
  }
  return this.show(chat,owner,uid??null);
 }
}
