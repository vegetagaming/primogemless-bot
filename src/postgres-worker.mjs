import {workerData} from 'node:worker_threads';
import pg from 'pg';
const {port,signal,config,schema,exclusive}=workerData;
const ready=new Int32Array(signal);
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('INTEGER_RANGE');return n;});
const client=new pg.Client({...config,connectionTimeoutMillis:15000,statement_timeout:20000,lock_timeout:15000,application_name:'primogemless'});
let failed=false;
client.on('error',()=>{failed=true;});
function reply(result){port.postMessage(result);Atomics.store(ready,0,1);Atomics.notify(ready,0);}
try{
  await client.connect();
  if(schema){
    if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('INVALID_SCHEMA');
    await client.query('SET search_path TO "'+schema+'"');
  }
  if(exclusive){
    const lock=await client.query("SELECT pg_try_advisory_lock(hashtext('primogemless'),hashtext(current_schema())) AS acquired");
    if(!lock.rows[0].acquired)throw new Error('ANOTHER_BOT_IS_RUNNING');
  }
  reply({ok:true});
}catch(error){reply({error:/^[A-Z0-9_]{3,40}$/.test(error.code??error.message)?(error.code??error.message):'DATABASE_CONNECT_FAILED'});await client.end().catch(()=>{});port.close();}
port.on('message',async request=>{
  try{
    if(failed)throw new Error('DATABASE_CONNECTION_LOST');
    if(request.op==='close'){await client.end();reply({ok:true});port.close();return;}
    const values=request.values.map(v=>v instanceof Uint8Array?Buffer.from(v):v);
    const result=await client.query(request.sql,values);
    reply({rows:result.rows??[],changes:result.rowCount??0});
  }catch(error){reply({error:/^[A-Z0-9_]{3,40}$/.test(error.code??error.message)?(error.code??error.message):'DATABASE_QUERY_FAILED'});}
});
