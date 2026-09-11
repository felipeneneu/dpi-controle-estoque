const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  // Check all unique job names to see patterns
  const r1 = await client.execute('SELECT COUNT(*) as total FROM mimaki_jobs');
  console.log('Total jobs saved:', r1.rows[0].total);

  // Check what the endpoint would return for duplicate folder_timestamp
  const r2 = await client.execute('SELECT folder_timestamp, job_name, raw_material_name FROM mimaki_jobs LIMIT 3');
  console.log('\nSample jobs:');
  r2.rows.forEach(row => console.log('  -', row.folder_timestamp, '|', row.job_name, '| raw_material:', row.raw_material_name));

  // Check if raw_material_name is always null
  const r3 = await client.execute("SELECT COUNT(*) as cnt FROM mimaki_jobs WHERE raw_material_name IS NOT NULL");
  console.log('\nJobs with raw_material_name:', r3.rows[0].cnt);

  const r4 = await client.execute("SELECT COUNT(*) as cnt FROM mimaki_jobs WHERE raw_material_name IS NULL");
  console.log('Jobs WITHOUT raw_material_name:', r4.rows[0].cnt);
}

main();
