const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  // Check tables
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.rows.map(r => r.name).join(', '));

  // Check if mimaki_jobs exists
  const hasMimaki = tables.rows.some(r => r.name === 'mimaki_jobs');
  console.log('mimaki_jobs exists:', hasMimaki);

  // Check machines with mimaki brand
  try {
    const machines = await client.execute("SELECT id, name, brand FROM machines WHERE brand LIKE '%mimaki%' OR brand LIKE '%Mimaki%'");
    console.log('\nMimaki machines:', JSON.stringify(machines.rows, null, 2));
  } catch (e) {
    console.log('Error checking machines:', e.message);
  }

  if (hasMimaki) {
    // Count jobs
    const count = await client.execute('SELECT COUNT(*) as total FROM mimaki_jobs');
    console.log('\nTotal mimaki_jobs:', count.rows[0].total);

    // Sample jobs
    const sample = await client.execute('SELECT id, machine_id, folder_timestamp, job_name, raw_material_name, material_status FROM mimaki_jobs LIMIT 5');
    console.log('\nSample jobs:');
    sample.rows.forEach(r => console.log(`  - ${r.job_name} | machine: ${r.machine_id} | material: ${r.raw_material_name} | status: ${r.material_status}`));
  }
}

main().catch(console.error);
