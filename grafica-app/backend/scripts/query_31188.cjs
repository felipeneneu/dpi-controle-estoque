const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const rows = await client.execute("SELECT key_filename, result, arrange_cnt, print_s_time, print_e_time, ink_total_cc FROM mimaki_test_jobs WHERE key_filename LIKE '%31188%'");
  console.log('Resultados para 31188:');
  rows.rows.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(console.error);
