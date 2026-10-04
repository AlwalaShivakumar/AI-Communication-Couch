import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const developmentProjectRef = 'dekorxyetwpgpyjeypfq';

export function developmentConnection(value: string | undefined) {
  if (!value) throw new Error('Set DEVELOPMENT_DATABASE_URL privately; do not post it in chat.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid development database connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres' || url.hash || (url.port && url.port !== '5432')) {
    throw new Error('Use a PostgreSQL direct or session-pooler connection on port 5432 to database postgres.');
  }
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${developmentProjectRef}.supabase.co` && ['postgres', `postgres.${developmentProjectRef}`].includes(user);
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${developmentProjectRef}`;
  if (!direct && !pooler) throw new Error('Refusing connection: target is not the approved DEVELOPMENT project.');
  if (!url.password) throw new Error('Supply the development database password privately in DEVELOPMENT_DATABASE_URL.');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert'].includes(key)) throw new Error('Unsupported database URL option.');
  }
  if (url.searchParams.has('sslmode') && url.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('TLS certificate and hostname verification are required (sslmode=verify-full).');
  }
  return { host: url.hostname, port: '5432', user, database: 'postgres', password: decodeURIComponent(url.password), rootCertificate: url.searchParams.get('sslrootcert') };
}

export function runDevelopmentMigration(args: string[]) {
  if (args.length !== 1 || args[0] !== '--acknowledge-development-no-backup') {
    throw new Error('Explicit --acknowledge-development-no-backup is required. No backup is claimed.');
  }
  const connection = developmentConnection(process.env.DEVELOPMENT_DATABASE_URL);
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: connection.host, PGPORT: connection.port, PGUSER: connection.user,
    PGDATABASE: connection.database, PGPASSWORD: connection.password, PGSSLMODE: 'verify-full' };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  delete env.PGOPTIONS;
  delete env.PGHOSTADDR;
  if (connection.rootCertificate) env.PGSSLROOTCERT = connection.rootCertificate;
  const sql = `SET app.migration_environment='development';
SET app.migration_project_ref='${developmentProjectRef}';
SET app.reviewed_backup='development-no-backup';
${readFileSync(resolve(__dirname, 'migrations/202610030001_security.sql'), 'utf8')}
RESET app.reviewed_backup;
RESET app.migration_project_ref;
RESET app.migration_environment;
`;
  console.log(`Target: DEVELOPMENT project ${developmentProjectRef}. No backup exists or is claimed by this acknowledgement.`);
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], { env, input: sql, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.error) throw new Error('Could not start psql. Install PostgreSQL client tools before execution.');
  if (result.status !== 0) throw new Error('Development migration failed. Review the failure; do not bypass its guards.');
}

if (require.main === module) {
  try { runDevelopmentMigration(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Development migration failed.'); process.exitCode = 1; }
}
