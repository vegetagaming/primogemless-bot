import {randomBytes} from 'node:crypto';
import {COOKIE_FIELDS,cleanCookies} from './vault.mjs';
import {UserError} from './history.mjs';

const button=(text,callback_data)=>({text,callback_data});
const keyboard=inline_keyboard=>({inline_keyboard});
export function parseCookieEntry(text){
 if(typeof text!=='string'||text.length>20000)throw new UserError('Invalid cookie entry.');
 const cookies={};
 for(const line of text.trim().split(/[;\r\n]+/).filter(x=>x.trim())){
  const m=line.trim().match(/^([a-z_0-9]+)\s*=\s*(\S+)$/i);
  if(!m||!COOKIE_FIELDS.includes(m[1].toLowerCase())||cookies[m[1].toLowerCase()]!==undefined)throw new UserError('Use one cookie_name=value per line. Include ltoken_v2 and ltuid_v2; the first letter is lowercase L. Do not send passwords or a full cookie dump.');
  cookies[m[1].toLowerCase()]=m[2];
 }
 if(cookies.ltoken_v2&&!/^v2_[A-Za-z0-9_.+/%=-]{40,8192}$/.test(cookies.ltoken_v2))throw new UserError('Copy the exact ltoken_v2 value. Do not add quotes, spaces or backslashes.');
 return cleanCookies(cookies);
}
export class CookieLogin{
 constructor(app){this.app=app;this.store=app.store;}
 async info(chat,owner){
  this.store.setUI(owner,{});
  return this.app.say(chat,'<b>Cookie connection · advanced</b>\n\nIf you already have your own fresh cookies, you can enter them from Telegram on Android, iPhone or desktop.\n\n<b>ltoken_v2 + ltuid_v2</b>: HoYoLAB roster, constellations and available diary data. Include <b>ltmid_v2</b> when present. This pair does <b>not</b> enable wish syncing.\n\n<b>Privacy:</b> raw cookies pass through Telegram cloud chat, which is not end-to-end encrypted. The bot requests deletion of your message and stores the verified session encrypted on its server. Deletion cannot guarantee removal from every Telegram copy. Only connect to an operator you trust.\n\nThe Windows helper encrypts credentials before upload. Use it if you prefer that route.',keyboard([[button('Continue with cookie entry','cookiebegin')],[button('Windows encrypted helper','beginlogin')],[button('Cookie / phone guide','cookieguide'),button('Back','login')]]));
 }
 async begin(chat,owner){
  if(!this.app.vault||!this.app.hoyo)throw new UserError('Account connection is unavailable.');
  const request={nonce:randomBytes(12).toString('hex'),expires:Date.now()+600000};this.store.setUI(owner,{cookieLogin:request});
  return this.app.say(chat,'<b>Enter fresh cookies · private chat only</b>\n\nTelegram receives the raw values before server encryption; this chat is not end-to-end encrypted. A successful login replaces your previous connection.\n\nSend one message with one field per line:\n<pre>ltuid_v2=YOUR_HOYOLAB_ACCOUNT_ID\nltoken_v2=YOUR_FRESH_TOKEN</pre>\nAdd <code>ltmid_v2=YOUR_MID</code> if your browser provides it. The first letter is lowercase <b>L</b>. Do not send your password.\n\nOnly your next cookie entry is accepted, within 10 minutes. The bot requests message deletion before verification.\n\nWish syncing also needs all three: <code>account_id_v2</code>, <code>account_mid_v2</code>, <code>cookie_token_v2</code>. The Windows helper collects those.',keyboard([[button('Cancel','login')]]));
 }
 async accept(chat,owner,message){
  const request=this.store.getUI(owner).cookieLogin;
  try{await this.app.tg.call('deleteMessage',{chat_id:chat,message_id:message.message_id});}catch{this.store.setUI(owner,{});throw new UserError('Telegram did not confirm message deletion, so the login was not saved. Delete your cookie message manually, then try /login again.');}
  if(!request||request.expires<Date.now()){this.store.setUI(owner,{});throw new UserError('Cookie entry expired. Open /login → Cookie connection again.');}
  const cookies=parseCookieEntry(message.text);
  const validateCurrent=()=>{const current=this.store.getUI(owner).cookieLogin;if(!current||current.nonce!==request.nonce||current.expires<Date.now())throw new UserError('The login request changed or expired. Nothing was connected.');};
  return this.app.finishConnection(chat,owner,cookies,validateCurrent);
 }
 async guide(chat){return this.app.say(chat,'<b>Cookie guide</b>\n\n<b>Desktop browser:</b> sign in at <a href="https://www.hoyolab.com/">HoYoLAB</a>, then DevTools → Application → Cookies. Copy only your own <code>ltoken_v2</code>, <code>ltuid_v2</code> and, when present, <code>ltmid_v2</code>. Keep values exact.\n\n<b>Android / iPhone:</b> the bot can accept cookies from either phone, but logging into the app does not export them. Standard Chrome Android inspection uses a computer; Safari iPhone inspection uses a Mac. The desktop F12 steps do not run directly on those mobile browsers.\n\nIf you already have cookies, return to Cookie connection. Otherwise use the Windows encrypted helper when a PC is available.\n\nTreat these as login credentials. Do not post them in groups or screenshots. Revoke any session you accidentally shared before copying a fresh one.',keyboard([[button('Cookie connection','cookielogin'),button('Windows helper','beginlogin')],[button('Back','login')]]));}
}
