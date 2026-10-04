import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { developmentConnection, developmentProjectRef, runDevelopmentMigration } from '../supabase/run-development-migration';

const migration=readFileSync('supabase/migrations/202610030001_security.sql','utf8');
const gate=migration.slice(migration.indexOf('DO $$'),migration.indexOf('END $$;')+'END $$;'.length);

test('development runner accepts only the pinned direct/session-pooler target with verified TLS',()=>{
 assert.equal(developmentConnection(`postgresql://postgres:fixture@db.${developmentProjectRef}.supabase.co:5432/postgres`).host,`db.${developmentProjectRef}.supabase.co`);
 assert.equal(developmentConnection(`postgresql://postgres.${developmentProjectRef}:fixture@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`).user,`postgres.${developmentProjectRef}`);
 for(const url of [undefined,'invalid',`postgresql://postgres@db.${developmentProjectRef}.supabase.co/postgres`,'postgresql://postgres:fixture@db.other-project.supabase.co/postgres',
  'postgresql://postgres.other-project:fixture@aws-0-ap-south-1.pooler.supabase.com/postgres',
  `postgresql://postgres:fixture@db.${developmentProjectRef}.supabase.co.attacker.test/postgres`,
  `postgresql://postgres.${developmentProjectRef}:fixture@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:fixture@db.${developmentProjectRef}.supabase.co/postgres?sslmode=require`,
  `postgresql://postgres:fixture@db.${developmentProjectRef}.supabase.co/postgres?options=unsafe`])assert.throws(()=>developmentConnection(url));
 assert.throws(()=>runDevelopmentMigration([]),/Explicit/);
});

test('no-backup acknowledgement cannot satisfy default, production, unknown or mismatched project gates',async()=>{
 const db=new PGlite();
 try{
  await db.exec("SET app.reviewed_backup='development-no-backup'");
  await assert.rejects(db.exec(gate),/Backup and schema review/);
  await db.exec("SET app.migration_environment='production'");
  await assert.rejects(db.exec(gate),/Backup and schema review/);
  await db.exec("SET app.migration_environment='unexpected'");
  await assert.rejects(db.exec(gate),/Unknown migration environment/);
  await db.exec("SET app.migration_environment='development'");
  await assert.rejects(db.exec(gate),/does not match/);
  await db.exec("SET app.migration_project_ref='other-project'");
  await assert.rejects(db.exec(gate),/does not match/);
  await db.exec(`SET app.migration_project_ref='${developmentProjectRef}'`);
  await db.exec(gate);
  await db.exec("SET app.migration_environment='production';SET app.reviewed_backup='yes'");
  await db.exec(gate);
 }finally{await db.close();}
});

test('development exemption still rejects existing application objects without changing them',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`SET app.migration_environment='development';SET app.migration_project_ref='${developmentProjectRef}';SET app.reviewed_backup='development-no-backup';CREATE TABLE public.sessions(id integer);INSERT INTO public.sessions VALUES(7);`);
  await assert.rejects(db.exec(migration),/Fresh-install conflict/);
  await db.exec('ROLLBACK');
  assert.deepEqual((await db.query('SELECT * FROM public.sessions')).rows,[{id:7}]);
 }finally{await db.close();}
});
