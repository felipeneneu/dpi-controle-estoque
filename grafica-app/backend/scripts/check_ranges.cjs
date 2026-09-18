const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const maxJob = await client.execute("SELECT MIN(folder_timestamp) as min_ts, MAX(folder_timestamp) as max_ts, COUNT(*) as c FROM mimaki_jobs");
  console.log('mimaki_jobs timestamps:', maxJob.rows[0]);

  const maxTest = await client.execute("SELECT MIN(print_s_time) as min_ts, MAX(print_s_time) as max_ts, COUNT(*) as c FROM mimaki_test_jobs");
  console.log('mimaki_test_jobs timestamps:', maxTest.rows[0]);

  // Checar se há algum jobName ou trecho parecido em mimaki_jobs
  const allJobNames = await client.execute("SELECT job_name, order_code, folder_timestamp FROM mimaki_jobs");
  const allTestKeys = await client.execute("SELECT key_filename, parsed_order_code, print_s_time, rip_s_time FROM mimaki_test_jobs");

  console.log('\nTodos os test keys:');
  allTestKeys.rows.forEach(r => console.log(' ', r.key_filename, '| Order:', r.parsed_order_code, '| Print_S:', r.print_s_time, '| RIP_S:', r.rip_s_time));

  console.log('\nÚltimos 15 job_name em mimaki_jobs:');
  allJobNames.rows.slice(0, 15).forEach(r => console.log(' ', r.job_name, '| Order:', r.order_code, '| FolderTS:', r.folder_timestamp));
}

main().catch(console.error);
