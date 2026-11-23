import {posix} from 'node:path';

export function persistentMount(dataDirectory, mountInfo) {
  if (!dataDirectory?.startsWith('/')) return false;
  const target=posix.resolve(dataDirectory);
  return mountInfo.split('\n').some(line=>{
    const raw=line.split(' ')[4];
    if(!raw)return false;
    const mount=raw.replace(/\\([0-7]{3})/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
    return mount!=='/' && (target===mount || target.startsWith(mount+'/'));
  });
}

export function healthy(state, mode, now=Date.now()) {
  const age=now-Date.parse(state?.seen_at);
  if(!Number.isFinite(age)||age<0||age>600000)return false;
  return mode==='hold' ? state.state==='migration' : ['running','reconnecting'].includes(state.state);
}
