import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

export interface ImpositionJobRecord {
  id: string;
  nome_job: string;
  caminho_origem: string;
  caminho_saida?: string | null;
  motor: 'CLI_NET' | 'ILLUSTRATOR_COM';
  material_id?: string | null;
  largura_substrato_mm: number;
  altura_substrato_mm: number;
  copias_solicitadas: number;
  copias_produzidas: number;
  grade_config: string;
  tempo_execucao_ms?: number | null;
  status: 'pendente' | 'processando' | 'concluido' | 'falhou';
  mensagem_erro?: string | null;
  created_at?: string;
}

export function resolveDatabasePath(): string {
  const isPackaged = typeof app !== 'undefined' && app ? app.isPackaged : false;
  if (isPackaged && typeof app.getPath === 'function') {
    const userDb = path.join(app.getPath('userData'), 'local-replica.db');
    if (fs.existsSync(userDb)) return userDb;
  }

  const candidates = [
    path.resolve(process.cwd(), 'grafica-app/backend/local-replica.db'),
    path.resolve(__dirname, '../../../../grafica-app/backend/local-replica.db'),
    path.resolve(__dirname, '../../../grafica-app/backend/local-replica.db'),
    path.resolve(__dirname, '../../grafica-app/backend/local-replica.db'),
    path.resolve(process.cwd(), 'local-replica.db'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return candidates[0];
}

let dbInstance: any = null;

export function initDatabase() {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Tenta carregar @libsql/client do backend ou node:sqlite nativo
  try {
    const libsqlCandidates = [
      path.resolve(process.cwd(), 'grafica-app/backend/node_modules/@libsql/client/lib-cjs/node.js'),
      path.resolve(__dirname, '../../../../grafica-app/backend/node_modules/@libsql/client/lib-cjs/node.js'),
      path.resolve(__dirname, '../../../grafica-app/backend/node_modules/@libsql/client/lib-cjs/node.js'),
    ];

    let createLibsqlClient: any = null;
    for (const c of libsqlCandidates) {
      if (fs.existsSync(c)) {
        createLibsqlClient = require(c).createClient;
        break;
      }
    }

    if (createLibsqlClient) {
      const client = createLibsqlClient({ url: `file:${dbPath}` });
      dbInstance = {
        type: 'libsql',
        execute: async (sql: string, args: any[] = []) => client.execute({ sql, args }),
      };
    }
  } catch (err: any) {
    console.warn('[db] @libsql/client não carregado, tentando node:sqlite:', err.message);
  }

  if (!dbInstance) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      dbInstance = {
        type: 'node:sqlite',
        execute: async (sql: string, args: any[] = []) => {
          if (sql.trim().toUpperCase().startsWith('SELECT')) {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...args);
            return { rows };
          } else {
            const stmt = db.prepare(sql);
            stmt.run(...args);
            return { rows: [] };
          }
        },
      };
    } catch (err: any) {
      console.error('[db] Falha ao inicializar SQLite nativo:', err.message);
    }
  }

  // Cria a tabela imposition_jobs se não existir
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS imposition_jobs (
      id TEXT PRIMARY KEY,
      nome_job TEXT NOT NULL,
      caminho_origem TEXT NOT NULL,
      caminho_saida TEXT,
      motor TEXT CHECK(motor IN ('CLI_NET', 'ILLUSTRATOR_COM')) NOT NULL,
      material_id TEXT,
      largura_substrato_mm REAL NOT NULL,
      altura_substrato_mm REAL NOT NULL,
      copias_solicitadas INTEGER NOT NULL,
      copias_produzidas INTEGER NOT NULL,
      grade_config TEXT NOT NULL,
      tempo_execucao_ms INTEGER,
      status TEXT CHECK(status IN ('pendente', 'processando', 'concluido', 'falhou')) NOT NULL DEFAULT 'pendente',
      mensagem_erro TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (dbInstance) {
    dbInstance.execute(createTableSql).catch((e: any) => {
      console.error('[db] Erro ao criar tabela imposition_jobs:', e.message);
    });
  }

  return dbInstance;
}

export async function criarImpositionJob(data: Partial<ImpositionJobRecord>): Promise<string> {
  const db = initDatabase();
  const id = data.id || `JOB-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const sql = `
    INSERT INTO imposition_jobs (
      id, nome_job, caminho_origem, caminho_saida, motor, material_id,
      largura_substrato_mm, altura_substrato_mm, copias_solicitadas,
      copias_produzidas, grade_config, tempo_execucao_ms, status, mensagem_erro
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  const args = [
    id,
    data.nome_job || 'Sem título',
    data.caminho_origem || '',
    data.caminho_saida || null,
    data.motor || 'ILLUSTRATOR_COM',
    data.material_id || null,
    data.largura_substrato_mm || 0,
    data.altura_substrato_mm || 0,
    data.copias_solicitadas || 0,
    data.copias_produzidas || 0,
    typeof data.grade_config === 'string' ? data.grade_config : JSON.stringify(data.grade_config || {}),
    data.tempo_execucao_ms || null,
    data.status || 'pendente',
    data.mensagem_erro || null,
  ];

  if (db) {
    await db.execute(sql, args);
  }

  return id;
}

export async function atualizarImpositionJob(data: {
  id: string;
  status?: 'pendente' | 'processando' | 'concluido' | 'falhou';
  caminho_saida?: string | null;
  tempo_execucao_ms?: number | null;
  mensagem_erro?: string | null;
}): Promise<boolean> {
  const db = initDatabase();
  if (!db || !data.id) return false;

  const sets: string[] = [];
  const args: any[] = [];

  if (data.status !== undefined) {
    sets.push('status = ?');
    args.push(data.status);
  }
  if (data.caminho_saida !== undefined) {
    sets.push('caminho_saida = ?');
    args.push(data.caminho_saida);
  }
  if (data.tempo_execucao_ms !== undefined) {
    sets.push('tempo_execucao_ms = ?');
    args.push(data.tempo_execucao_ms);
  }
  if (data.mensagem_erro !== undefined) {
    sets.push('mensagem_erro = ?');
    args.push(data.mensagem_erro);
  }

  if (sets.length === 0) return false;

  args.push(data.id);
  const sql = `UPDATE imposition_jobs SET ${sets.join(', ')} WHERE id = ?;`;
  await db.execute(sql, args);
  return true;
}

export async function listarImpositionJobsRecentes(limit = 20): Promise<ImpositionJobRecord[]> {
  const db = initDatabase();
  if (!db) return [];

  const sql = `SELECT * FROM imposition_jobs ORDER BY created_at DESC LIMIT ?;`;
  const result = await db.execute(sql, [limit]);
  return (result.rows || []) as ImpositionJobRecord[];
}

export async function listarBobinasEstoque(): Promise<Array<{ id: string; nome: string; larguraMm: number; largura_mm: number }>> {
  const db = initDatabase();
  let items: Array<{ id: string; nome: string; larguraMm: number; largura_mm: number }> = [];

  if (db) {
    try {
      const sql = `
        SELECT id, name as nome, width as larguraMm
        FROM stock_items
        WHERE category = 'PAPER_MEDIA' OR width IS NOT NULL
        ORDER BY name ASC;
      `;
      const result = await db.execute(sql, []);
      if (result && result.rows && result.rows.length > 0) {
        items = (result.rows as any[]).map((row) => {
          const w = Number(row.larguraMm || row.width || 1000);
          const widthMm = w < 10 ? Math.round(w * 1000) : w;
          return {
            id: String(row.id),
            nome: String(row.nome || row.name || row.id),
            larguraMm: widthMm,
            largura_mm: widthMm,
          };
        });
      }
    } catch (_) {}
  }

  if (items.length === 0) {
    items = [
      { id: 'bob-75', nome: 'Bobina Vinil 0.75m (Útil 665mm)', larguraMm: 665, largura_mm: 665 },
      { id: 'bob-100', nome: 'Bobina Vinil 1.00m (Útil 950mm)', larguraMm: 950, largura_mm: 950 },
      { id: 'bob-106', nome: 'Bobina Vinil 1.06m (Útil 1000mm)', larguraMm: 1000, largura_mm: 1000 },
      { id: 'bob-127', nome: 'Bobina Vinil 1.27m (Útil 1220mm)', larguraMm: 1220, largura_mm: 1220 },
      { id: 'bob-137', nome: 'Bobina Vinil 1.37m (Útil 1300mm)', larguraMm: 1300, largura_mm: 1300 },
      { id: 'bob-152', nome: 'Bobina Vinil 1.52m (Útil 1470mm)', larguraMm: 1470, largura_mm: 1470 },
      { id: 'bob-160', nome: 'Bobina Vinil 1.60m (Útil 1520mm)', larguraMm: 1520, largura_mm: 1520 },
      { id: 'chp-7010', nome: 'Chapa Offset/Digital 70×100', larguraMm: 700, largura_mm: 700 },
      { id: 'chp-5070', nome: 'Chapa Meia Folha 50×70', larguraMm: 500, largura_mm: 500 },
    ];
  }

  return items;
}
