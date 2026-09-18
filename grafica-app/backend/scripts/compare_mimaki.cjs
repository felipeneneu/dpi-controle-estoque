const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  console.log('=== VERIFICANDO MIMAKI_TEST_JOBS ===');
  const countTest = await client.execute('SELECT COUNT(*) as total FROM mimaki_test_jobs');
  console.log('Total mimaki_test_jobs:', countTest.rows[0].total);

  const sampleTest = await client.execute('SELECT id, key_filename, source_file, result, result_detail, print_s_time, rip_s_time, parsed_order_code, parsed_client, parsed_material, ink_total_cc, created_at FROM mimaki_test_jobs ORDER BY created_at DESC LIMIT 10');
  console.log('Sample mimaki_test_jobs:');
  sampleTest.rows.forEach(r => console.log(`  - Key: "${r.key_filename}" | RIP_S: ${r.rip_s_time} | Print_S: ${r.print_s_time} | Result: ${r.result} | Ink: ${r.ink_total_cc}cc | OrderCode: ${r.parsed_order_code}`));

  console.log('\n=== VERIFICANDO MIMAKI_JOBS (PRODUÇÃO / RIP) ===');
  const countJobs = await client.execute('SELECT COUNT(*) as total FROM mimaki_jobs');
  console.log('Total mimaki_jobs:', countJobs.rows[0].total);

  const sampleJobs = await client.execute('SELECT id, job_name, order_code, folder_timestamp, length_meters, width_mm, height_mm, ink_total_cc, created_at FROM mimaki_jobs ORDER BY created_at DESC LIMIT 10');
  console.log('Sample mimaki_jobs:');
  sampleJobs.rows.forEach(r => console.log(`  - Job: "${r.job_name}" | FolderTS: ${r.folder_timestamp} | OrderCode: ${r.order_code} | Dim: ${r.width_mm}x${r.height_mm}mm | Len: ${r.length_meters}m | Ink: ${r.ink_total_cc}cc`));

  console.log('\n=== TESTANDO CORRELAÇÃO / CASAMENTO ENTRE AS DUAS TABELAS ===');
  // Tentativa 1: Casamento direto por nome do arquivo
  const matchByName = await client.execute(`
    SELECT 
      j.id as job_id, 
      j.job_name, 
      j.folder_timestamp, 
      j.ink_total_cc as job_ink,
      t.id as test_id, 
      t.key_filename, 
      t.print_s_time, 
      t.rip_s_time,
      t.ink_total_cc as test_ink
    FROM mimaki_jobs j
    JOIN mimaki_test_jobs t 
      ON j.job_name = t.key_filename 
      OR t.key_filename LIKE '%' || j.job_name || '%'
      OR j.job_name LIKE '%' || t.key_filename || '%'
    LIMIT 20
  `);
  console.log('Casamento por nome (LIKE):', matchByName.rows.length, 'registros encontrados');
  matchByName.rows.forEach(r => {
    console.log(`  MATCH: Job "${r.job_name}" <---> TestKey "${r.key_filename}"`);
    console.log(`         JobTS: ${r.folder_timestamp} | Test_PrintS: ${r.print_s_time} | Test_RipS: ${r.rip_s_time} | InkJob: ${r.job_ink}cc vs InkTest: ${r.test_ink}cc`);
  });

  // Tentativa 2: Casamento por Order Code
  const matchByOrder = await client.execute(`
    SELECT 
      j.id as job_id, 
      j.order_code as job_order, 
      j.job_name,
      t.id as test_id, 
      t.parsed_order_code as test_order, 
      t.key_filename,
      t.print_s_time
    FROM mimaki_jobs j
    JOIN mimaki_test_jobs t 
      ON j.order_code IS NOT NULL 
      AND t.parsed_order_code IS NOT NULL 
      AND j.order_code = t.parsed_order_code
    LIMIT 10
  `);
  console.log('\nCasamento por OrderCode:', matchByOrder.rows.length, 'registros encontrados');
  matchByOrder.rows.forEach(r => {
    console.log(`  MATCH ORDER: ${r.job_order} | Job: "${r.job_name}" <---> Test: "${r.key_filename}" | Print_S: ${r.print_s_time}`);
  });

  // Tentativa 3: Verificação de re-impressões no mimaki_test_jobs
  const reprints = await client.execute(`
    SELECT key_filename, COUNT(*) as print_count, GROUP_CONCAT(print_s_time, ', ') as print_times
    FROM mimaki_test_jobs
    GROUP BY key_filename
    HAVING COUNT(*) > 1
    LIMIT 10
  `);
  console.log('\nArquivos re-impressos em mimaki_test_jobs (múltiplos prints do mesmo arquivo):');
  reprints.rows.forEach(r => {
    console.log(`  - "${r.key_filename}": impresso ${r.print_count} vezes nos horários: ${r.print_times}`);
  });
}

main().catch(console.error);
