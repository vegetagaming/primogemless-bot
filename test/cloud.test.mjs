import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentMount,healthy} from '../ops/cloud-state.mjs';

test('cloud startup requires a separate mount containing the data directory',()=>{
  const root='1 0 0:1 / / rw - overlay overlay rw';
  const disk='2 1 8:0 / /data rw - ext4 /dev/sda rw';
  assert.equal(persistentMount('/data',root),false);
  assert.equal(persistentMount('/data',root+'\n'+disk),true);
  assert.equal(persistentMount('/data/archive',disk),true);
  assert.equal(persistentMount('/data-other',disk),false);
  assert.equal(persistentMount('/data/../app',disk),false);
  assert.equal(persistentMount('/data folder','2 1 8:0 / /data\\040folder rw - ext4 /dev/sda rw'),true);
});

test('cloud health rejects old, invalid, stopped, and mismatched migration state',()=>{
  const now=Date.now();
  const state={state:'running',seen_at:new Date(now).toISOString()};
  assert.equal(healthy(state,'run',now),true);
  assert.equal(healthy(state,'hold',now),false);
  assert.equal(healthy({...state,state:'migration'},'hold',now),true);
  assert.equal(healthy({...state,state:'migration'},'run',now),false);
  assert.equal(healthy({...state,state:'stopped'},'run',now),false);
  assert.equal(healthy(state,'run',now+600001),false);
  assert.equal(healthy({...state,seen_at:'invalid'},'run',now),false);
});
