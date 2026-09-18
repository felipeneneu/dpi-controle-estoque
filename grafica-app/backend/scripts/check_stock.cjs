const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/grafica-app/backend/.env' });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  console.log('=== BOBINAS ===');
  const b = await client.execute(`
    SELECT b.id, b.serial, b.width_mm, b.meters_initial, b.meters_remaining, b.state, b.location, s.name as item_name, s.code as item_code
    FROM bobinas b
    LEFT JOIN stock_items s ON b.stock_item_id = s.id
  `);
  console.log(JSON.stringify(b.rows, null, 2));

  console.log('\n=== TINTAS UV EM STOCK_ITEMS ===');
  const inks = await client.execute("SELECT id, name, current_quantity, min_quantity, unit FROM stock_items WHERE name LIKE '%UV%' OR name LIKE '%Tinta%'");
  console.log(JSON.stringify(inks.rows, null, 2));

  console.log('\n=== GARRAFAS ATIVAS ===');
  const g = await client.execute(`
    SELECT g.id, g.serial, g.ml_initial, g.ml_remaining, g.state, g.location, s.name as item_name
    FROM garrafas g
    LEFT JOIN stock_items s ON g.stock_item_id = s.id
  `);
  console.log(JSON.stringify(g.rows, null, 2));
}

main().catch(console.error);
