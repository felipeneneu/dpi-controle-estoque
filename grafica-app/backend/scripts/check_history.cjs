const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const rows = await client.execute("SELECT job_name, width_mm, height_mm, length_meters, copy_number, total_print, pages FROM mimaki_jobs LIMIT 10");
  console.log('Comparação histórica em mimaki_jobs (dados do RIP):');
  rows.rows.forEach(r => {
    const calc = Number(((r.height_mm * (r.total_print || 1)) / 1000).toFixed(3));
    console.log(`Job: "${r.job_name.slice(0, 35)}..."`);
    console.log(`  Width: ${r.width_mm} mm | Height: ${r.height_mm} mm | Copies/Total: ${r.total_print} | LengthMeters no banco: ${r.length_meters} m | (Height * Total)/1000 = ${calc} m`);
  });
}

main().catch(console.error);
