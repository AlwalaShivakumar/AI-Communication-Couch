import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const target=process.argv[2];
if(!target)throw new Error('Provide the explicitly approved development project URL as the argument.');
const expected=new URL(target);
if(expected.protocol!=='https:' || !expected.hostname.endsWith('.supabase.co') || expected.username || expected.password || expected.pathname!=='/' || expected.search || expected.hash)throw new Error('Use a plain HTTPS Supabase development project URL.');
if(!existsSync('.env.integration.local'))throw new Error('Create .env.integration.local from the environment example with development-only credentials.');
const config=parseEnv(readFileSync('.env.integration.local','utf8'));
if(config.NEXT_PUBLIC_SUPABASE_URL!==expected.origin)throw new Error('Integration configuration does not match the explicitly approved development project.');
if(existsSync('.env.local')){
 const existing=parseEnv(readFileSync('.env.local','utf8'));
 if(existing.NEXT_PUBLIC_SUPABASE_URL===expected.origin)throw new Error('Integration project matches the existing app project; isolation must be reviewed before connecting.');
}
const key=config.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!key || key.startsWith('sb_secret_'))throw new Error('Supply the development publishable/anon key in .env.integration.local; do not use a service-role key.');
if(key.startsWith('eyJ')){
 const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
 if(payload.role!=='anon')throw new Error('Integration key must have anon role.');
}else if(!key.startsWith('sb_publishable_'))throw new Error('Use a publishable key or legacy anon JWT.');
const timedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
const db=createClient(expected.origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:timedFetch}});
const checks=[];
const settingsResponse=await timedFetch(expected.origin+'/auth/v1/settings',{headers:{apikey:key}});
if(!settingsResponse.ok)throw new Error('Development Auth settings could not be read. Check the URL/key locally.');
const settings=await settingsResponse.json();
checks.push({name:'Auth settings reachable',status:'passed'});
checks.push({name:'Email authentication',status:settings.external?.email===true?'enabled':'needs verification'});
checks.push({name:'Email confirmation',status:settings.mailer_autoconfirm===false?'required':settings.mailer_autoconfirm===true?'not required':'needs verification'});
checks.push({name:'Anonymous authentication',status:settings.external?.anonymous_users===true?'enabled':settings.external?.anonymous_users===false?'disabled':'needs verification'});
for(const table of ['profiles','sessions','session_feedbacks','session_dimensions']){
 const {data,error}=await db.from(table).select('id').limit(1);
 if(error){
   checks.push({name:table+' anonymous SELECT',status:error.code==='42501'?'denied':error.code==='PGRST205'?'table unavailable':'needs verification',code:error.code});
 }else{
   checks.push({name:table+' anonymous SELECT',status:data?.length?'SECURITY FAILURE: anonymous rows visible':'no rows visible; policies unverified'});
 }
}
const report={project:expected.origin,mode:'read-only anonymous preflight',checks,limitations:[
 'Does not create users, alter schema, apply migrations, write data, call AI providers or inspect real RLS definitions.',
 'Empty anonymous results do not prove secure RLS; schema/policy inspection and authenticated two-user tests remain required.',
]};
mkdirSync('scratch',{recursive:true});
writeFileSync('scratch/development-preflight.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(checks.some(c=>c.status.startsWith('SECURITY FAILURE')))process.exitCode=1;
