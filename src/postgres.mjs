import {Worker,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';
import {postgresSql} from './postgres-sql.mjs';

// Store is synchronous. One worker owns one PG session, preserving transactions and
// committing every write before returning. No periodic snapshots or local-only saves.
// The service is deliberately a single instance; the session advisory lock enforces it.
export class PostgresDatabase {
  constructor(config,{schema='public',exclusive=true,timeout=45000}={}){
    const {port1,port2}=new MessageChannel();
    this.port=port1;this.signal=new Int32Array(new SharedArrayBuffer(4));this.timeout=timeout;this.closed=false;
    this.worker=new Worker(new URL('./postgres-worker.mjs',import.meta.url),{
      workerData:{port:port2,signal:this.signal.buffer,config,schema,exclusive},transferList:[port2],
      env:{NODE_ENV:process.env.NODE_ENV??'production'},execArgv:[],stdout:true,stderr:true
    });
    this.worker.on('error',()=>{});this.worker.stdout.resume();this.worker.stderr.resume();
    try{this.wait();}catch(error){this.closeWorker();throw error;}
  }
  wait(){
    if(Atomics.wait(this.signal,0,0,this.timeout)==='timed-out'){this.closeWorker();throw new Error('DATABASE_TIMEOUT');}
    const result=receiveMessageOnPort(this.port)?.message;
    if(!result){this.closeWorker();throw new Error('DATABASE_PROTOCOL_FAILED');}
    if(result.error)throw new Error('POSTGRES_'+result.error);
    return result;
  }
  request(sql,values=[],op='query'){
    if(this.closed)throw new Error('DATABASE_CLOSED');
    Atomics.store(this.signal,0,0);this.port.postMessage({sql,values,op});return this.wait();
  }
  exec(sql){const translated=postgresSql(sql);if(translated)this.request(translated);}
  prepare(sql){const text=postgresSql(sql);return {
    run:(...values)=>this.request(text,values),
    all:(...values)=>this.request(text,values).rows,
    get:(...values)=>this.request(text,values).rows[0]
  };}
  closeWorker(){this.closed=true;this.port.close();void this.worker.terminate();}
  close(){if(!this.closed){try{this.request('',[],'close');}finally{this.closeWorker();}}}
}

export function postgresConfig(env=process.env){
  if(!env.BOT_DATABASE_URL)return null;
  const url=new URL(env.BOT_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('INVALID_DATABASE_URL');
  const config={host:env.BOT_DATABASE_TUNNEL||url.hostname,port:Number(url.port||5432),database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};
  if(url.searchParams.get('sslmode')!=='disable')config.ssl={rejectUnauthorized:true,servername:url.hostname,...(env.BOT_DATABASE_CA?{ca:env.BOT_DATABASE_CA}:{})};
  // Used only with the authenticated CLI loopback tunnel, retaining TLS hostname checks.
  return config;
}
