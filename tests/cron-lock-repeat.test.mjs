import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { withCronRunLock } from '../dist/cron-locks.js';
const require=createRequire(import.meta.url);

function database(t, initial) {
  let row=initial ? {...initial} : null;
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDbConfigured',()=>true);
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDb',()=>({from:()=>({
    insert: value=>({select:()=>({maybeSingle:async()=>{
      if(row)return{error:{code:'23505'}};
      row={...value};return{data:{...row}};
    }})}),
    select:()=>{const query={eq:()=>query,single:async()=>({data:{...row}})};return query;},
    update: changes=>{
      const filters={};
      const apply=()=>{
        if(!row || !Object.entries(filters).every(([key,value])=>row[key]===value)) return{data:[]};
        row={...row,...changes};return{data:[{job:row.job}]};
      };
      const query={eq:(key,value)=>{filters[key]=value;return query;},select:async()=>apply(),
        then:(resolve,reject)=>Promise.resolve(apply()).then(resolve,reject)};
      return query;
    },
  })}));
  return()=>row;
}

const now=new Date('2026-10-16T18:00:00Z');
const completed={job:'availability',project_key:'project',slot:'shared',run_date:'2026-10-16',
  status:'completed',started_at:'2026-10-16T17:00:00Z'};

test('ordinary completed cron slots still skip while repeatable availability locks allow successive runs',async t=>{
  const read=database(t,completed);
  let calls=0;
  const runner=async()=>++calls;
  assert.equal((await withCronRunLock('availability','project','shared',runner,now)).reason,'already_completed');
  for(let i=0;i<2;i++) {
    const result=await withCronRunLock('availability','project','shared',runner,now,{repeatCompleted:true});
    assert.equal(result.skipped,false);
    assert.equal(read().status,'completed');
  }
  assert.equal(calls,2);
});

test('repeatable lock still rejects an in-flight run',async t=>{
  database(t,{...completed,status:'running',started_at:now.toISOString()});
  const result=await withCronRunLock('availability','project','shared',async()=>{throw new Error('Must not run');},now,{repeatCompleted:true});
  assert.equal(result.reason,'already_running');
});

test('repeatable sending fails closed when the atomic lock table is missing',async t=>{
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDbConfigured',()=>true);
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDb',()=>({from:()=>({insert:()=>({select:()=>({maybeSingle:async()=>({error:{code:'42P01',message:'relation automation_run_locks does not exist'}})})})})}));
  t.mock.method(require('../dist/runtime-db.js'),'runtimeTableMissing',()=>true);
  await assert.rejects(withCronRunLock('availability','project','shared',async()=>{throw new Error('Must not run');},now,{repeatCompleted:true}),/Atomic lock storage is required/);
});
