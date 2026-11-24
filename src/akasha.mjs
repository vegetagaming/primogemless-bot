import {UserError} from './history.mjs';
import {Enka,publicUid} from './enka.mjs';
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const btn=(text,callback_data)=>({text,callback_data}),kb=inline_keyboard=>({inline_keyboard});
const home=[btn('⌂ Home','start')];
export const akashaLinks=uid=>({profile:'https://akasha.cv/profile/'+publicUid(uid),enka:'https://enka.network/u/'+publicUid(uid)+'/',leaderboards:'https://akasha.cv/leaderboards'});
export class Akasha {
 constructor(app,enka=new Enka()){this.app=app;this.enka=enka;}
 links(uid){const urls=akashaLinks(uid);return [[{text:'Akasha profile · ranks & Top %',url:urls.profile}],[{text:'Leaderboards ↗',url:urls.leaderboards},{text:'Enka showcase ↗',url:urls.enka}]];}
 async show(chat,owner){
  const a=this.app.store.selected(owner);
  if(!a)return this.app.say(chat,'<b>🏆 AKASHA</b>\n\nYour public character builds and rankings. Connect a Genshin account or import a wish backup to use your saved UID here.\n\nAkasha ranks and Top % open on its website. Build cards use Enka’s public showcase.',kb([[btn('Connect account','connect')],[{text:'Open Akasha ↗',url:'https://akasha.cv/'}],[btn('Showcase setup','akhelp')],home]));
  return this.app.visual(chat,'<b>🏆 AKASHA</b>\nUID <code>'+a.uid+'</code>\n\n<b>Build cards</b> — character stats, weapons and artifacts in Telegram.\n<b>Ranks & Top %</b> — open your profile on Akasha.\n<b>Leaderboards</b> — browse Akasha’s comparison categories.\n\n<i>Uses your public UID. No extra login. Akasha currently blocks the bot’s ranking requests, so ranks open on the website.</i>',kb([[btn('Character build cards','akbuilds:'+a.uid)],...this.links(a.uid),[btn('Change account','akaccounts'),btn('Showcase setup','akhelp')],home]),{type:'dashboard',eyebrow:'BUILDS & RANKINGS',title:'Your builds. In focus.',subtitle:'Character cards here. Rankings on Akasha.',metrics:[{value:'BUILD',label:'CHARACTER CARDS'},{value:'RANK',label:'AKASHA PROFILE'},{value:'TOP %',label:'LEADERBOARDS'},{value:'UID',label:'PUBLIC SHOWCASE'}],uid:a.uid,footer:'Build data: Enka.Network  ·  Rankings: Akasha.cv',accent:'#a5d8c5'});
 }
 async accounts(chat,owner){return this.app.say(chat,'<b>Choose your Akasha profile</b>',kb([...this.app.store.accounts(owner).map(a=>[btn('UID '+a.uid,'akaccount:'+a.uid)]),[btn('← AKASHA','akasha')]]));}
 async help(chat,owner){return this.app.say(chat,'<b>Make your builds visible</b>\n\n1. In Genshin, open your profile and edit Character Showcase.\n2. Add the characters you want to show and enable <b>Show character details</b>.\n3. Open your Akasha profile and use its refresh option if needed. Return here for Character build cards.\n\nOnly characters in your public showcase are available here. Refresh respects Enka’s cache, so changes may take a few minutes. Your game can be closed afterward.\n\nAkasha rankings compare builds within specific leaderboard rules; read the category description before comparing Top %.',kb([[btn('← AKASHA','akasha')],home]));}
 async builds(chat,owner,uid,id=null){
  this.app.account(owner,uid);publicUid(uid);
  let profile;try{profile=await this.enka.showcase(uid);}catch(error){if(!(error instanceof UserError))throw error;return this.app.say(chat,'<b>Showcase unavailable</b>\n\n'+esc(error.message),kb([...this.links(uid),[btn('↻ Retry builds','akbuilds:'+uid),btn('Showcase setup','akhelp')],[btn('← AKASHA','akasha')]]));}
  if(!profile.builds.length)return this.app.say(chat,'<b>No public character details yet</b>\nUID <code>'+uid+'</code>\n\nAdd characters to your in-game Character Showcase and turn on <b>Show character details</b>, then return here.\n\nYour connected HoYoLAB roster and your public showcase are separate.',kb([[btn('Showcase setup','akhelp'),btn('↻ Refresh','akbuilds:'+uid)],...this.links(uid),[btn('← AKASHA','akasha')]]));
  if(id){const build=profile.builds.find(b=>b.id===id);if(!build)throw new UserError('That character is no longer in this public showcase. Open AKASHA → Character build cards again.');
   const text='<b>'+esc(build.name)+'</b> · C'+build.constellation+' · Lv. '+build.level+'\n'+esc(profile.nickname)+' · UID '+uid+'\n\n'+(build.weapon?esc(build.weapon.name)+' · R'+build.weapon.refinement+' · Lv. '+build.weapon.level:'No weapon equipped')+'\nArtifact CV: <b>'+build.cv.toFixed(1)+'</b> · 2 × CRIT Rate + CRIT DMG\n\n<i>Public showcase via Enka. Artifact CV includes main stats and substats; it is not an Akasha rank.</i>';
   return this.app.visual(chat,text,kb([[btn('← Characters','akbuilds:'+uid)],...this.links(uid),[btn('↻ Refresh build','akcard:'+uid+':'+id),btn('AKASHA','akasha')]]),{type:'showcase',...build,uid,nickname:profile.nickname});
  }
  const buttons=profile.builds.map(b=>({...btn(b.name+' · C'+b.constellation,'akcard:'+uid+':'+b.id),ui_icon:this.app.art?.emoji(b.id)})),rows=[];for(let i=0;i<buttons.length;i+=2)rows.push(buttons.slice(i,i+2));
  return this.app.say(chat,'<b>Public character builds</b>\n'+esc(profile.nickname)+' · UID '+uid+'\n\nChoose a character for its stats, weapon and five artifacts.\n\n<i>Enka showcase snapshot · refresh available after '+esc(profile.refreshAt.slice(11,19))+' UTC.</i>',kb([...rows,[btn('↻ Refresh showcase','akbuilds:'+uid)],...this.links(uid),[btn('← AKASHA','akasha')]]));
 }
 handles(action){return ['akasha','akhelp','akaccounts','akaccount','akbuilds','akcard'].includes(action);}
 async route(chat,owner,bits){
  const [action,uid,id]=bits;
  if(action==='akasha')return this.show(chat,owner);
  if(action==='akhelp')return this.help(chat,owner);
  if(action==='akaccounts')return this.accounts(chat,owner);
  if(action==='akaccount'){this.app.account(owner,uid);this.app.store.select(owner,uid);return this.show(chat,owner);}
  return this.builds(chat,owner,uid,action==='akcard'?id:null);
 }
}
