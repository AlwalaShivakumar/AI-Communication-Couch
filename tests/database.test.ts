import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
const sid='10000000-0000-4000-8000-000000000001';
const payload={id:sid,mode:'interview',duration_ms:1000,speaking_time_ms:500,feedbacks:[{transcript:'A valid interview answer',score:0,biggest_weakness:'Clarity',fix:'Lead with the answer',is_retry:false,retry_improvement:null,raw_feedback:'## Feedback',dimensions:[{dimension:'Grammar',score:0}]}]};
async function setup() {
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon; INSERT INTO auth.users VALUES ('${a}'),('${b}'); SET app.migration_environment='development'; SET app.migration_project_ref='dekorxyetwpgpyjeypfq'; SET app.reviewed_backup='development-no-backup';`);
 // Deliberately permissive defaults verify explicit revocations, not an empty ACL fixture.
 await db.exec('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC, anon, authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;');
 try { await db.exec(readFileSync('supabase/migrations/202610030001_security.sql','utf8')); }
 catch(error) { await db.close(); throw error; }
 return db;
}
async function identity(db:PGlite,id:string) { await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`); }
test('User A and B cannot read or modify each other, including children and RPCs', async () => {
 const db=await setup();
 try {
  await identity(db,a); await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]);
  await Promise.all(Array.from({length:3},()=>db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify({...payload,feedbacks:[{...payload.feedbacks[0],score:100}]})])));
  assert.equal((await db.query('SELECT * FROM public.sessions')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM public.session_feedbacks')).rows.length,1);
  assert.equal((await db.query<{overall_score:number}>('SELECT overall_score FROM public.sessions')).rows[0].overall_score,0);
  await db.query('INSERT INTO public.profiles(id) VALUES ($1)',[a]);
  await identity(db,b);
  for(const table of ['profiles','sessions','session_feedbacks','session_dimensions']) {
   assert.equal((await db.query('SELECT * FROM public.'+table)).rows.length,0);
   assert.equal((await db.query('DELETE FROM public.'+table+' RETURNING *')).rows.length,0);
  }
  assert.equal((await db.query('UPDATE public.sessions SET mode=\'story\' RETURNING *')).rows.length,0);
  await assert.rejects(db.query('INSERT INTO public.sessions(user_id,mode) VALUES ($1,\'story\')',[a]));
  await assert.rejects(db.query('INSERT INTO public.session_dimensions(session_id,dimension,score) VALUES ($1,\'Grammar\',10)',[sid]));
  await assert.rejects(db.query('INSERT INTO public.session_feedbacks(session_id,transcript,score,biggest_weakness,fix) VALUES ($1,\'Other user answer\',10,\'weak\',\'fix\')',[sid]));
  await assert.rejects(db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]));
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM public.sessions'));
  await assert.rejects(db.query('SELECT public.consume_ai_quota(1)'));
 } finally {await db.close();}
});
test('owner transfer is denied, invalid child data rolls back all session writes',async()=>{
 const db=await setup();
 try {
  await identity(db,a); await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]);
  await assert.rejects(db.query('UPDATE public.sessions SET user_id=$1',[b]));
  const invalid={...payload,id:'10000000-0000-4000-8000-000000000002',feedbacks:[{...payload.feedbacks[0],score:101}]};
  await assert.rejects(db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(invalid)]));
  assert.equal((await db.query('SELECT * FROM public.sessions')).rows.length,1);
 }finally{await db.close();}
});
test('quota cannot be bypassed by concurrent requests or invalid cost',async()=>{
 const db=await setup();
 try{
  await identity(db,a);
  const result=await Promise.all(Array.from({length:8},()=>db.query<{consume_ai_quota:boolean}>('SELECT public.consume_ai_quota(2)')));
  assert.equal(result.filter(r=>r.rows[0].consume_ai_quota).length,6);
  await assert.rejects(db.query('SELECT public.consume_ai_quota(-1)'));
 }finally{await db.close();}
});
test('migration stops on legacy owners without deleting data',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY,target_role text);INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000003','Legacy');SET app.reviewed_backup='yes';");
  await assert.rejects(db.exec(readFileSync('supabase/migrations/202610030001_security.sql','utf8')),/Fresh-install conflict/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT * FROM public.profiles')).rows.length,1);
 }finally{await db.close();}
});

test('daily/global quota caps and backup review gate are enforced locally',async()=>{
 const db=await setup();
 try{
  await db.query("INSERT INTO private.ai_quota VALUES ($1,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',120)",['day:'+a]);
  await identity(db,a);
  assert.equal((await db.query<{consume_ai_quota:boolean}>('SELECT public.consume_ai_quota(1)')).rows[0].consume_ai_quota,false);
  await db.exec("RESET ROLE;DELETE FROM private.ai_quota;INSERT INTO private.ai_quota VALUES ('global',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1000);");
  await identity(db,b);
  assert.equal((await db.query<{consume_ai_quota:boolean}>('SELECT public.consume_ai_quota(1)')).rows[0].consume_ai_quota,false);
 }finally{await db.close();}
 const blank=new PGlite();
 try{await assert.rejects(blank.exec(readFileSync('supabase/migrations/202610030001_security.sql','utf8')),/Backup/);}
 finally{await blank.close();}
});

test('null and out-of-range quota costs fail without changing counters',async()=>{
 const db=await setup();
 try{
  await identity(db,a);
  for(const cost of [null,-1,0,3,2147483647]) {
   await assert.rejects(db.query('SELECT public.consume_ai_quota($1::integer)',[cost]),/Invalid quota request/);
  }
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT * FROM private.ai_quota')).rows.length,0);
 }finally{await db.close();}
});

test('RPC rejects malformed and oversized JSON before writes with explicit validation errors',async()=>{
 const db=await setup();
 const feedback=payload.feedbacks[0];
 const withFeedback=(changes:Record<string,unknown>)=>({...payload,feedbacks:[{...feedback,...changes}]});
 const invalid:unknown[]=[null,[],42,'session',{},
  {...payload,id:null},{...payload,id:'bad-id'},{...payload,id:42},{...payload,user_id:b},
  {...payload,mode:'unknown'},{...payload,mode:null},
  ...[-1,14400001,0.5,'1000',null].map(duration_ms=>({...payload,duration_ms})),
  ...[-1,1001,0.5,'500',null].map(speaking_time_ms=>({...payload,speaking_time_ms})),
  {...payload,feedbacks:null},{...payload,feedbacks:{}},{...payload,feedbacks:Array(51).fill(feedback)},
  {...payload,feedbacks:[null]},{...payload,feedbacks:[42]},
  ...[-1,101,0.5,'10',null].map(score=>withFeedback({score})),
  ...['short',' '.repeat(10),'x'.repeat(12001),null,42].map(transcript=>withFeedback({transcript})),
  withFeedback({biggest_weakness:'x'.repeat(1001)}),withFeedback({fix:'x'.repeat(2001)}),
  withFeedback({biggest_weakness:null}),withFeedback({fix:42}),withFeedback({is_retry:'true'}),withFeedback({is_retry:null}),
  ...[-101,101,0.5,'10'].map(retry_improvement=>withFeedback({retry_improvement})),
  withFeedback({raw_feedback:'x'.repeat(24001)}),withFeedback({raw_feedback:{text:'unexpected structure'}}),
  withFeedback({raw_feedback:[]}),withFeedback({unexpected:true}),
  ...[null,{},Array(9).fill({dimension:'Grammar',score:1}),[null],
   [{dimension:'Unknown',score:1}],[{dimension:'Grammar',score:101}],
   [{dimension:'Grammar',score:-1}],[{dimension:'Grammar',score:0.5}],
   [{dimension:'Grammar',score:'1'}],[{dimension:'Grammar',score:null}],
   [{dimension:'Grammar'}],[{dimension:'Grammar',score:1,extra:true}]].map(dimensions=>withFeedback({dimensions}))
 ];
 const missingFeedback={...feedback} as Record<string,unknown>;delete missingFeedback.raw_feedback;
 invalid.push({...payload,feedbacks:[missingFeedback]});
 try{
  await identity(db,a);
  for(const input of invalid) {
   await assert.rejects(db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(input)]),
    (error:unknown)=>(error as {code?:string}).code==='22023');
  }
  for(const table of ['sessions','session_feedbacks','session_dimensions'])assert.equal((await db.query('SELECT * FROM public.'+table)).rows.length,0);
  const optionalDimensions={...feedback} as Record<string,unknown>;delete optionalDimensions.dimensions;
  await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify({...payload,feedbacks:[{...optionalDimensions,raw_feedback:null}]})]);
  assert.equal((await db.query('SELECT * FROM public.sessions')).rows.length,1);
  assert.equal((await db.query<{raw_feedback:unknown}>('SELECT raw_feedback FROM public.session_feedbacks')).rows[0].raw_feedback,null);
 }finally{await db.close();}
});

test('explicit ACLs deny private access and public/anon execution despite permissive defaults',async()=>{
 const db=await setup();
 try{
  await db.exec('CREATE ROLE public_probe;GRANT USAGE ON SCHEMA public TO public_probe;');
  for(const role of ['anon','authenticated','public_probe']) {
   assert.equal((await db.query<{allowed:boolean}>("SELECT has_schema_privilege($1,'private','USAGE') AS allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query<{allowed:boolean}>("SELECT has_table_privilege($1,'private.ai_quota','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",[role])).rows[0].allowed,false);
   await db.exec('RESET ROLE;SET ROLE '+role);
   await assert.rejects(db.query('SELECT * FROM private.ai_quota'));
   await assert.rejects(db.query("INSERT INTO private.ai_quota VALUES ('fake',now(),0)"));
   if(role!=='authenticated') {
    for(const table of ['profiles','sessions','session_feedbacks','session_dimensions'])await assert.rejects(db.query('SELECT * FROM public.'+table));
    await assert.rejects(db.query('SELECT public.consume_ai_quota(1)'));
    await assert.rejects(db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]));
   }
   await db.exec('RESET ROLE');
  }
  await db.exec("SET request.jwt.claim.sub='';SET ROLE authenticated");
  await assert.rejects(db.query('SELECT public.consume_ai_quota(1)'),/Invalid quota request/);
  await assert.rejects(db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]),/authenticated identity/);
  await assert.rejects(db.query("INSERT INTO public.sessions(user_id,mode) VALUES ($1,'story')",[a]));
 }finally{await db.close();}
});

test('direct CRUD enforces all owners and rejects parent reassignment and oversized raw feedback',async()=>{
 const db=await setup();
 const otherSid='10000000-0000-4000-8000-000000000002';
 try{
  await identity(db,a);
  await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]);
  await db.query('INSERT INTO public.profiles(id) VALUES ($1)',[a]);
  await identity(db,b);
  await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify({...payload,id:otherSid})]);
  await assert.rejects(db.query('INSERT INTO public.profiles(id) VALUES ($1)',[a]));
  for(const table of ['session_feedbacks','session_dimensions']){
   await assert.rejects(db.query('UPDATE public.'+table+' SET session_id=$1',[sid]));
  }
  for(const [table,column,value] of [['profiles','target_role','changed'],['sessions','mode','story'],['session_feedbacks','fix','changed'],['session_dimensions','dimension','Fluency']]) {
   const filter=table==='profiles'?'id':table==='sessions'?'user_id':'session_id';
   const foreignId=table==='session_feedbacks'||table==='session_dimensions'?sid:a;
   assert.equal((await db.query(`UPDATE public.${table} SET ${column}=$1 WHERE ${filter}=$2 RETURNING *`,[value,foreignId])).rows.length,0);
   assert.equal((await db.query(`DELETE FROM public.${table} WHERE ${filter}=$1 RETURNING *`,[foreignId])).rows.length,0);
  }
  await assert.rejects(db.query('UPDATE public.session_feedbacks SET raw_feedback=$1::jsonb',[JSON.stringify('x'.repeat(24001))]));
  await assert.rejects(db.query('UPDATE public.session_feedbacks SET raw_feedback=$1::jsonb',[JSON.stringify({nested:'unsupported'})]));
  await identity(db,a);await assert.rejects(db.query('UPDATE public.profiles SET id=$1',[b]));
 }finally{await db.close();}
});

test('fresh installation aborts on relations, routines, types or private schema and on rerun',async()=>{
 for(const objectSql of ['CREATE TABLE public.sessions(id uuid)','CREATE TYPE public.profiles AS ENUM (\'unexpected\')',
  'CREATE FUNCTION public.save_practice_session(jsonb) RETURNS integer LANGUAGE sql AS $$SELECT 1$$',
  'CREATE SCHEMA private','CREATE SEQUENCE public.unexpected']) {
  const db=new PGlite();
  try{
   await db.exec("SET app.reviewed_backup='yes';"+objectSql);
   await assert.rejects(db.exec(readFileSync('supabase/migrations/202610030001_security.sql','utf8')),/Fresh-install conflict/);
   await db.exec('ROLLBACK');
   assert.equal((await db.query<{relation:string|null}>("SELECT to_regclass('public.session_feedbacks') AS relation")).rows[0].relation,null);
  }finally{await db.close();}
 }
 const db=await setup();
 try{
  await identity(db,a);await db.query('SELECT public.save_practice_session($1::jsonb)',[JSON.stringify(payload)]);
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec(readFileSync('supabase/migrations/202610030001_security.sql','utf8')),/Fresh-install conflict/);
  await db.exec('ROLLBACK');await identity(db,a);
  assert.equal((await db.query('SELECT * FROM public.sessions')).rows.length,1);
 }finally{await db.close();}
});

test('prerequisite inspection runs read-only and exposes metadata without user records',async()=>{
 const db=await setup();
 try{
  const result=await db.exec(readFileSync('supabase/inspection-prerequisites.sql','utf8'));
  const report=result.flatMap(r=>r.rows)[0].development_prerequisite_inspection as {context:{read_only:string};auth_users_identity:{table_exists:boolean;id:{type:string};unique_identity_indexes:unknown[]};roles:unknown[]};
  assert.equal(report.context.read_only,'on');
  assert.equal(report.auth_users_identity.table_exists,true);
  assert.equal(report.auth_users_identity.id.type,'uuid');
  assert.equal(report.auth_users_identity.unique_identity_indexes.length,1);
  assert.equal((await db.query('SELECT * FROM auth.users')).rows.length,2);
 }finally{await db.close();}
});

test('migration creates the intended constraints, indexes, RLS policies and function modes once',async()=>{
 const db=await setup();
 try{
  const tables=await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'");
  assert.equal(tables.rows.length,4);
  assert.ok(tables.rows.every(t=>t.relrowsecurity && t.relforcerowsecurity));
  const fks=await db.query<{conname:string}>("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'");
  assert.deepEqual(fks.rows.map(r=>r.conname).sort(),['dimension_parent','feedback_parent','profiles_auth_owner','sessions_auth_owner']);
  assert.equal((await db.query("SELECT * FROM pg_indexes WHERE schemaname='public'")).rows.length,7);
  const policies=await db.query<{roles:string[];cmd:string;qual:string;with_check:string}>("SELECT roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'");
  assert.equal(policies.rows.length,4);
  assert.ok(policies.rows.every(p=>p.roles.join(',')==='authenticated' && p.cmd==='ALL' && p.qual.includes('auth.uid()') && p.with_check.includes('auth.uid()')));
  const functions=await db.query<{proname:string;prosecdef:boolean;proconfig:string[]}>("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname");
  assert.equal(functions.rows.length,2);
  assert.equal(functions.rows[0].proname,'consume_ai_quota');assert.equal(functions.rows[0].prosecdef,true);
  assert.equal(functions.rows[1].proname,'save_practice_session');assert.equal(functions.rows[1].prosecdef,false);
  assert.ok(functions.rows.every(f=>f.proconfig.some(c=>/^search_path=(?:""|)$/.test(c))));
 }finally{await db.close();}
});
