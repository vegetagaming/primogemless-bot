import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {healthy} from './cloud-state.mjs';
try{
  const state=JSON.parse(readFileSync(resolve(process.env.BOT_DATA_DIR??'/data','health.json'),'utf8'));
  process.exitCode=healthy(state,process.env.BOT_DEPLOYMENT_MODE??'hold')?0:1;
}catch{process.exitCode=1;}
