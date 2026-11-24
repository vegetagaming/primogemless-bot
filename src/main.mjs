import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Telegram, TelegramError } from './telegram.mjs';
import { Store } from './store.mjs';
import {PostgresDatabase,postgresConfig} from './postgres.mjs';
import { BotApp, COMMANDS } from './app.mjs';
import { Vault } from './vault.mjs';
import { Hoyo } from './hoyo.mjs';
import { SyncService } from './sync.mjs';
import { loadSchedule } from './patches.mjs';
import { IconTheme, ThemedTelegram } from './icons.mjs';
import { Artwork } from './artwork.mjs';
import { CardRenderer } from './render.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=resolve(process.env.BOT_DATA_DIR??resolve(root,'.local'));
let tg;
try {tg=new Telegram(process.env.TELEGRAM_BOT_TOKEN);} catch {console.error('Set TELEGRAM_BOT_TOKEN using Start-Bot.ps1 or your hosting secret manager.');process.exit(1);}
delete process.env.TELEGRAM_BOT_TOKEN;
const databaseConfig=postgresConfig();
const store=new Store(resolve(runtime,'wishes.sqlite'),databaseConfig?{database:new PostgresDatabase(databaseConfig)}:{});
delete process.env.BOT_DATABASE_URL;delete process.env.BOT_DATABASE_CA;
if(databaseConfig&&store.getMeta('cloud_migration_complete')!=='ready'){console.error('CLOUD_ARCHIVE_REQUIRED: complete and verify migration before running.');store.close();process.exit(1);}
loadSchedule(store);
let vault;
try {vault=new Vault(store,Buffer.from(process.env.BOT_VAULT_KEY??'','base64'));}catch{console.error('The encrypted session vault could not be opened. Check BOT_VAULT_KEY or Start-Bot.ps1.');store.close();process.exit(1);}
delete process.env.BOT_VAULT_KEY;
const hoyo=new Hoyo(),sync=new SyncService({store,vault,hoyo});
const icons=new IconTheme(store);
const configuredOwner=process.env.BOT_OWNER_ID??store.getMeta('bot_owner_id');
const ownerId=/^\d+$/.test(configuredOwner??'')?configuredOwner:null;
const art=new Artwork(store,resolve(runtime,'artwork'));
const app=new BotApp({telegram:new ThemedTelegram(tg,icons),store,vault,hoyo,sync,icons,ownerId,art,renderer:new CardRenderer(art)});
let stopping=false;
const stopPath=resolve(runtime,'stop.request'),healthPath=resolve(runtime,'health.json');
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
function shouldStop(){if(existsSync(stopPath))stopping=true;return stopping;}
function heartbeat(state='running'){writeFileSync(healthPath,JSON.stringify({state,pid:process.pid,seen_at:new Date().toISOString()}));}
function log(event,code='') {console.log(`${new Date().toISOString()} ${event}${code?' '+code:''}`);}
function code(error) {return error instanceof TelegramError?String(error.code).replace(/[^A-Z0-9_]/g,''):'INTERNAL';}
async function run() {
  const me=await tg.call('getMe');
  const webhook=await tg.call('getWebhookInfo');
  if(webhook.url) {log('STOPPED_EXISTING_WEBHOOK');process.exitCode=1;return;}
  if(process.argv.includes('--setup')) {
    await tg.call('setMyCommands',{commands:COMMANDS,scope:{type:'all_private_chats'}});
    await tg.call('setMyCommands',{commands:COMMANDS});
    await tg.call('setMyDescription',{description:'Your Genshin companion: Tutorial · Wish History · Earned Primogems · Owned Characters. Open Tutorial for the video guide and account connection. Track monthly income, constellations and 5-star weapons. Independent fan project.'});
    await tg.call('setMyShortDescription',{short_description:'Wish History · Earned Primogems · Owned Characters. Start with /tutorial for HoYoLAB setup.'});
    await tg.call('setChatMenuButton',{menu_button:{type:'commands'}});
    const registered=await tg.call('getMyCommands',{scope:{type:'all_private_chats'}}),defaults=await tg.call('getMyCommands');
    if(JSON.stringify(registered)!==JSON.stringify(COMMANDS)||JSON.stringify(defaults)!==JSON.stringify(COMMANDS))throw new Error('COMMAND_REGISTRATION_MISMATCH');
    console.log(JSON.stringify({status:'configured',username:me.username,commands:registered.map(x=>x.command)}));
    return;
  }
  if(process.argv.includes('--check')) {console.log(JSON.stringify({status:'connected',username:me.username,bot_id:me.id,webhook:false}));return;}
  const pidPath=resolve(runtime,'bot.pid');
  try{unlinkSync(stopPath);}catch{}
  writeFileSync(pidPath,String(process.pid));
  writeFileSync(resolve(runtime,'process.json'),JSON.stringify({pid:process.pid,started_at:Date.now()-process.uptime()*1000}));
  log('BOT_RUNNING');
  heartbeat();
  sync.start();
  let offset=Number(store.getMeta('telegram_offset')??0),failures=0;
  try {
    while(!shouldStop()) {
      let updates;
      try {
        updates=await tg.call('getUpdates',{offset,timeout:25,limit:20,allowed_updates:['message','callback_query']});failures=0;heartbeat();
      } catch(error) {
        log('POLL_FAILED',code(error));
        if(shouldStop())break;
        if(error instanceof TelegramError&&[401,409].includes(error.code)) {process.exitCode=1;break;}
        heartbeat('reconnecting');
        await delay(Math.min(60000,Math.max(1000*2**Math.min(++failures,5),(error.retryAfter??0)*1000)));continue;
      }
      for(const update of updates) {
        if(shouldStop()) break;
        try {await app.handle(update);log('UPDATE_HANDLED');}
        catch(error) {
          log('UPDATE_FAILED',code(error));
          const m=update.callback_query?.message??update.message;
          const actor=update.callback_query?.from??m?.from;
          if(m?.chat?.type==='private'&&String(actor?.id)===String(m.chat.id)) await tg.message(m.chat.id,'That request could not be completed. Please try again shortly. If you were uploading, retrying the same file is safe; duplicates are skipped.').catch(()=>{});
        }
        offset=update.update_id+1;store.setMeta('telegram_offset',offset);
        heartbeat();
      }
    }
  } finally {
    await sync.stop();
    try{if(readFileSync(pidPath,'utf8')===String(process.pid))unlinkSync(pidPath);}catch{}
    try{if(JSON.parse(readFileSync(healthPath,'utf8')).pid===process.pid)heartbeat('stopped');}catch{}
    log('BOT_STOPPED');
  }
}
run().catch(error=>{log('START_FAILED',code(error));process.exitCode=1;}).finally(()=>store.close());
