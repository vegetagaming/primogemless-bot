import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {persistentMount} from './cloud-state.mjs';

const runtime=resolve(process.env.BOT_DATA_DIR??'/data');
const mode=process.env.BOT_DEPLOYMENT_MODE??'hold';
function fail(message){console.error(message);process.exit(1);}
if(!['hold','run'].includes(mode))fail('Set BOT_DEPLOYMENT_MODE to hold or run.');
let mounts='';
try{mounts=readFileSync('/proc/self/mountinfo','utf8');}catch{}
if(!persistentMount(runtime,mounts))fail('CLOUD_STORAGE_REQUIRED: attach a persistent volume at BOT_DATA_DIR before starting.');
mkdirSync(runtime,{recursive:true});
if(mode==='hold'){
  const heartbeat=()=>writeFileSync(resolve(runtime,'health.json'),JSON.stringify({state:'migration',pid:process.pid,seen_at:new Date().toISOString()}));
  heartbeat();
  console.log('CLOUD_MIGRATION_HOLD: storage is ready; Telegram polling and account sync are disabled.');
  const timer=setInterval(heartbeat,25000);
  const stop=()=>{clearInterval(timer);process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}else{
  if(!existsSync(resolve(runtime,'wishes.sqlite')))fail('CLOUD_ARCHIVE_REQUIRED: restore the existing archive before switching to run.');
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.BOT_VAULT_KEY)fail('CLOUD_SECRETS_REQUIRED: set the bot token and the existing encryption key as runtime secrets.');
  await import('../src/main.mjs');
}
