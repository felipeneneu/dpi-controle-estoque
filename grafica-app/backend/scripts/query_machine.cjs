const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const m = await client.execute("SELECT * FROM machines WHERE id = 'c6dfb08e-07fe-45c9-b978-be8d8f40a6bb'");
  console.log('Machine Mimaki UCJV300-75:');
  console.log(JSON.stringify(m.rows[0], null, 2));
}

main().catch(console.error);
