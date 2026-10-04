import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import assert from 'node:assert/strict';

const user = { id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous'},user_metadata:{},created_at:new Date().toISOString() };
const expires = Math.floor(Date.now()/1000)+3600;
const encode = value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:expires,iat:expires-3600});
const token = unsigned+'.'+createHmac('sha256','isolated-fixture-signing-key').update(unsigned).digest('base64url');
let quotaFailure = false, verifiedRequests = 0, quotaRequests = 0;
const stub = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','application/json');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  if(req.headers.authorization !== 'Bearer '+token){send(401,{message:'Invalid fixture identity'});return;}
  if(url.pathname === '/auth/v1/user'){verifiedRequests++;send(200,user);return;}
  if(url.pathname === '/rest/v1/profiles'){
    if(url.searchParams.get('id') !== 'eq.'+user.id){send(403,{message:'Wrong owner filter'});return;}
    send(200,[{preferred_name:'Test user',target_role:'',career_goal:'',experience_level:''}]);return;
  }
  if(url.pathname === '/rest/v1/rpc/consume_ai_quota'){
    quotaRequests++;
    let raw='';for await(const chunk of req)raw+=chunk;
    if(JSON.parse(raw).p_cost !== 2){send(400,{message:'Wrong quota weight'});return;}
    if(quotaFailure)send(503,{message:'Fixture unavailable'});else send(200,false);
    return;
  }
  send(503,{message:'Unsupported isolated test operation'});
});
await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
const serviceUrl='http://127.0.0.1:'+stub.address().port;
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL:serviceUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_isolated_test', GEMINI_API_KEY:'isolated-test-key' };
const cli='node_modules/next/dist/bin/next';
let app, appError;
function finished(child){return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Process exited '+code)));});}
async function unusedPort(){
 const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));return port;
}
try{
 const cookies=new Map();
 const client=createServerClient(serviceUrl,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{
   getAll:()=>Array.from(cookies,([name,value])=>({name,value})),
   setAll:values=>values.forEach(({name,value})=>cookies.set(name,value)),
 }});
 const {error}=await client.auth.setSession({access_token:token,refresh_token:'isolated-fixture-refresh'});
 assert.equal(error,null);
 const cookie=Array.from(cookies,([name,value])=>name+'='+value).join('; ');
 assert.ok(cookie);
 await finished(spawn(process.execPath,[cli,'build'],{env,stdio:'inherit'}));
 const port=await unusedPort(),base='http://127.0.0.1:'+port;
 app=spawn(process.execPath,[cli,'start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'inherit'});
 app.once('error',error=>{appError=error;});
 let ready=false;
 for(let attempt=0;attempt<60;attempt++){
   if(appError)throw appError;
   if(app.exitCode!==null)throw new Error('Production server exited before startup');
   try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.ok(ready,'Production server did not start');
 for(const endpoint of ['/api/analyze','/api/evaluate']){
   const input=endpoint.endsWith('analyze')?{segmentText:'A valid practice response',mode:'conversation'}:{question:'Describe your experience',answer:'A valid interview response'};
   const post=(body,headers={})=>fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
   let response=await post({});
   assert.equal(response.status,401,endpoint+' requires a session');
   assert.match(response.headers.get('cache-control'),/no-store/);
   assert.ok((await response.json()).error);
   response=await post({}, {Origin:'https://untrusted.example'});assert.equal(response.status,403);
   response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:'text'});assert.equal(response.status,415);
   response=await post({...input,userId:'00000000-0000-4000-8000-000000000002'},{Cookie:cookie});assert.equal(response.status,400,'Browser identity must be rejected');
   response=await post({...input,...(endpoint.endsWith('analyze')?{segmentText:'x'.repeat(12001)}:{answer:'x'.repeat(12001)})},{Cookie:cookie});assert.equal(response.status,400);
   response=await post({oversized:'x'.repeat(150001)},{Cookie:cookie});assert.equal(response.status,413);
   response=await post(input,{Cookie:cookie});assert.equal(response.status,429,'Quota must prevent provider access');
   assert.equal(response.headers.get('retry-after'),'60');
   quotaFailure=true;
   response=await post(input,{Cookie:cookie});assert.equal(response.status,503,'Missing quota service must fail closed');
   assert.equal((await response.json()).error,'AI practice is temporarily unavailable. Please try again later.');
   quotaFailure=false;
 }
 const callback=await fetch(base+'/auth/callback?next=https://untrusted.example',{redirect:'manual'});
 assert.equal(callback.status,307);assert.equal(new URL(callback.headers.get('location')).pathname,'/auth');
 const history=await fetch(base+'/insights');assert.equal(history.status,200);assert.match(history.headers.get('cache-control'),/no-store/);
 assert.ok(verifiedRequests>=12,'Authenticated paths must verify identity through the fixture Auth service');
 assert.equal(quotaRequests,4);
 writeFileSync('.next/production-smoke-result.json',JSON.stringify({passed:true,configuration:'isolated Auth/Data API fixtures',authenticatedBoundaries:true},null,2));
 console.log('Production HTTP checks passed: verified identity, validation, ownership filter, quotas, safe errors and unauthenticated boundaries.');
}finally{
 if(app && app.exitCode===null && app.signalCode===null){const stopped=new Promise(resolve=>app.once('exit',resolve));app.kill();await stopped;}
 await new Promise(resolve=>stub.close(resolve));
}
