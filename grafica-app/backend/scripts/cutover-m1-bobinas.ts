import { db } from '../src/db/index.js';
import { stockItems, bobinas, stockTransactions } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('Iniciando Cutover para M1 Bobinas...');

  try {
    // 1. Zera a quantidade atual e a quantidade mínima de todos os SKUs para forçar o uso do modelo novo
    console.log('Zerando currentQuantity de todos os itens de estoque...');
    await db.update(stockItems).set({ currentQuantity: 0 });
    
    // 2. Limpa quaisquer bobinas que por acaso tenham sido criadas (ambiente limpo)
    console.log('Limpando tabela de bobinas...');
    await db.delete(bobinas);

    // Nota: Como o plano pede cutover abrupto, não vamos criar bobinas a partir do saldo legado.
    console.log('Cutover concluído com sucesso! Estoque pronto para fluxo por bobina.');
  } catch (error) {
    console.error('Erro durante o cutover:', error);
  }
}

run();
