import {randomBytes} from 'node:crypto';
import {COOKIE_FIELDS,cleanCookies,cookieCapabilities} from './vault.mjs';
import {UserError} from './history.mjs';

const button=(text,callback_data)=>({text,callback_data});
const keyboard=inline_keyboard=>({inline_keyboard});
const modes=[button('Connect wishes + HoYoLAB','cookiemode:wishes'),button('HoYoLAB only','cookiemode:hoyolab')];
const platforms=[button('Android','cookieguide:android'),button('iPhone / iPad','cookieguide:ios')];
const fields='<b>HoYoLAB page</b>\n<code>ltuid_v2</code> + <code>ltoken_v2</code>\nAlso copy <code>ltmid_v2</code> if present. The first letter is lowercase L.\n\n<b>Genshin redemption page · for wish syncing</b>\n<code>account_id_v2</code> + <code>account_mid_v2</code> + <code>cookie_token_v2</code>\nUse the same HoYoverse account on both pages. These account IDs are not your Genshin UID.';
const officialPages=[{text:'Open HoYoLAB',url:'https://www.hoyolab.com/'},{text:'Open Genshin redemption',url:'https://genshin.hoyoverse.com/en/gift'}];
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
  return this.app.say(chat,'<b>Manual cookie connection</b>\n\nCopy selected login cookies from your own browser and send them in one message. Choose a phone guide below, or continue if you already have the values.\n\n<b>Wishes + HoYoLAB:</b> needs cookies from both HoYoLAB and the Genshin redemption page. Wish access is verified before syncing is enabled.\n<b>HoYoLAB only:</b> characters, diary and available Real-Time Notes; no automatic wish history.\n\n<b>Privacy:</b> raw values pass through Telegram cloud chat, which is not end-to-end encrypted. The bot requests deletion before verification and stores a verified session encrypted. The operator can decrypt it to access account data. Deletion cannot guarantee removal from every Telegram copy.\n\nThe Windows helper encrypts the connection file before upload.',keyboard([platforms,[button('Desktop guide','cookieguide:desktop')],...modes.map(b=>[b]),[button('Windows encrypted helper','beginlogin'),button('Back','login')]]));
 }
 async begin(chat,owner,mode='auto'){
  if(!this.app.vault||!this.app.hoyo)throw new UserError('Account connection is unavailable.');
  if(!['auto','wishes','hoyolab'].includes(mode))throw new UserError('Choose a connection mode first.');
  const request={nonce:randomBytes(12).toString('hex'),expires:Date.now()+600000,mode};this.store.setUI(owner,{cookieLogin:request});
  const example='ltuid_v2=YOUR_HOYOLAB_ACCOUNT_ID\nltoken_v2=YOUR_FRESH_TOKEN'+(mode==='wishes'?'\naccount_id_v2=YOUR_ACCOUNT_ID\naccount_mid_v2=YOUR_ACCOUNT_MID\ncookie_token_v2=YOUR_COOKIE_TOKEN':'');
  return this.app.say(chat,'<b>'+ (mode==='wishes'?'Connect wishes + HoYoLAB':mode==='hoyolab'?'Connect HoYoLAB only':'Enter fresh cookies')+'</b>\n\nTelegram receives raw values; this chat is not end-to-end encrypted. The bot requests message deletion before verification, then encrypts the verified session on its server. The operator can decrypt it. A successful login replaces your previous connection.\n\nReplace the placeholders and send <b>one text message</b> with one field per line:\n<pre>'+example+'</pre>\nAdd <code>ltmid_v2=YOUR_MID</code> only if present. Keep values exact: no quotes or backslashes. Use cookies from the same account; account IDs are not your Genshin UID.\n\n'+(mode==='wishes'?'All five fields above are required. Missing wish cookies will not switch you to HoYoLAB-only mode.':mode==='hoyolab'?'This mode does not sync wishes. For wish cookies, cancel and choose Connect wishes + HoYoLAB.':'HoYoLAB cookies alone do not sync wishes. Full wish access also needs account_id_v2, account_mid_v2 and cookie_token_v2.')+'\n\nThe entry window lasts <b>10 minutes</b>. No password, screenshots or full cookie exports. Deletion cannot guarantee removal from every Telegram copy.',keyboard([[button('Cancel','cookielogin')]]));
 }
 async accept(chat,owner,message){
  const request=this.store.getUI(owner).cookieLogin;
  try{await this.app.tg.call('deleteMessage',{chat_id:chat,message_id:message.message_id});}catch{this.store.setUI(owner,{});throw new UserError('Telegram did not confirm message deletion, so the login was not saved. Delete your cookie message manually, then try /login again.');}
  if(!request||request.expires<Date.now()){this.store.setUI(owner,{});throw new UserError('Cookie entry expired. Open /login → Cookie connection again.');}
  const cookies=parseCookieEntry(message.text);
  const caps=cookieCapabilities(cookies);
  if(request.mode==='wishes'&&(!caps.wishes||!caps.hoyolab||!cookies.ltuid_v2))throw new UserError('Missing required cookies for wishes + HoYoLAB. Include ltuid_v2 + ltoken_v2 from HoYoLAB and account_id_v2 + account_mid_v2 + cookie_token_v2 from the Genshin redemption page. Your previous connection is unchanged. Send the complete message within the entry window, or cancel.');
  if(request.mode==='hoyolab'&&(!caps.hoyolab||cookies.cookie_token_v2||cookies.account_id_v2||cookies.account_mid_v2))throw new UserError('For HoYoLAB-only mode, send ltuid_v2 + ltoken_v2 and optional ltmid_v2. To include wish cookies, cancel and choose Connect wishes + HoYoLAB. Your previous connection is unchanged.');
  const validateCurrent=()=>{const current=this.store.getUI(owner).cookieLogin;if(!current||current.nonce!==request.nonce||current.expires<Date.now())throw new UserError('The login request changed or expired. Nothing was connected.');};
  return this.app.finishConnection(chat,owner,cookies,validateCurrent);
 }
 async guide(chat,platform){
  if(!platform)return this.app.say(chat,'<b>Choose your cookie guide</b>\n\nPhone browsers need a compatible cookie-viewing extension. Chrome’s Desktop site option changes the page layout; it does not add DevTools.\n\nUse the browser in your guide, not Telegram’s built-in browser. Sign in there even if you already use the HoYoLAB app.',keyboard([platforms,[button('Desktop browser','cookieguide:desktop')],[button('Back','cookielogin')]]));
  const guides={
   android:{title:'Android · Firefox',setup:'1. In <b>Firefox for Android</b>, install <b>Cookie-Editor by cgagnier</b> from the Mozilla link below.\n2. Open HoYoLAB in Firefox and sign in. Open Firefox’s Extensions menu → Cookie-Editor. Allow access to this site when prompted. Search each required name, expand it and copy its Value without changing or saving the cookie.\n3. Open the Genshin redemption page in the <b>same browser</b>, sign in to the same account, and repeat for the wish fields. No game launch is needed.',link:{text:'Cookie-Editor · Mozilla',url:'https://addons.mozilla.org/en-US/android/addon/cookie-editor/'}},
   ios:{title:'iPhone / iPad · Safari',setup:'1. Install <b>Cookie-Editor by Christophe Gagnier</b> from the App Store link below. Enable it in Settings → Apps → Safari → Extensions (older iOS: Settings → Safari).\n2. Open HoYoLAB in <b>Safari</b> and sign in. Open the page menu (aA / Extensions) → Cookie-Editor and allow access to this site. Search each name and copy its Value without editing the cookie.\n3. Repeat on the Genshin redemption page using the same account.\n\n<b>Safari limitation:</b> this extension documents that some cookies, including HttpOnly cookies, may be hidden. If a required value is missing, full wish syncing cannot be enabled this way. Use the Windows helper, or choose HoYoLAB only if both of its fields are visible. Availability depends on your iOS/browser version.',link:{text:'Cookie-Editor · App Store',url:'https://apps.apple.com/app/cookie-editor/id6446215341'}},
   desktop:{title:'Desktop · Chrome / Edge',setup:'1. Sign in to HoYoLAB in your browser. Open DevTools (F12 or Inspect) → Application → Cookies → the HoYoLAB site.\n2. Search each required cookie name and copy its Value.\n3. Sign in to the Genshin redemption page with the same account. Inspect its hoyoverse.com cookies and copy the wish fields. Do not use the game UID as an account ID.'}
  },guide=guides[platform];
  if(!guide)throw new UserError('Choose Android, iPhone / iPad or Desktop.');
  return this.app.say(chat,'<b>'+guide.title+'</b>\n\n'+guide.setup+'\n\n'+fields+'\n\n<b>Send to the bot</b>\nCollect the fields, then tap a connection mode below and send one name=value message. The bot verifies access; having an extension does not guarantee a valid session.\n\nCopy only the listed values, not Export all. These are login credentials: grant the extension access only to the sites you use where supported, and remove that access afterward. Telegram receives raw values; the bot requests deletion and encrypts verified storage.',keyboard([...(guide.link?[[guide.link]]:[]),officialPages,...modes.map(b=>[b]),[button('Other devices','cookieguide'),button('Windows helper','beginlogin')],[button('Back','cookielogin')]]));
 }
}
