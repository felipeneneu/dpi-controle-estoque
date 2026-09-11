import type { FastifyInstance } from 'fastify';
import { eq, and, gte, lt } from 'drizzle-orm';
import { printJobs, machines, mimakiJobs } from '../db/schema.js';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { sumPrecise } from '../lib/math.js';

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/reports/consumption', {
    schema: {
      tags: ['Relatórios'],
      summary: 'Relatório mensal de consumo por máquina',
      description:
        'Agrega os jobs de impressão por máquina e mês. Para HP: consumo de tinta por cor e área em m². Para Konica: total de páginas/folhas. Para Mimaki: consumo de tinta por cor em cc e comprimento em metros.',
      querystring: {
        type: 'object',
        properties: {
          machineId: { type: 'string' },
          month: { type: 'string', description: 'Mês no formato YYYY-MM. Padrão: mês atual.' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const query = request.query as { machineId?: string; month?: string };
    const now = new Date();
    const month = query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRange(month);

    const rows = await db
      .select()
      .from(printJobs)
      .where(
        and(
          query.machineId ? eq(printJobs.machineId, query.machineId) : undefined,
          gte(printJobs.printEndDate, start),
          lt(printJobs.printEndDate, end),
        ),
      )
      .all();

    // Detectar se é Konica (Laser), HP (Inkjet) ou Mimaki
    let isKonica = false;
    let isMimaki = false;
    let machineName: string | null = null;
    if (query.machineId) {
      const m = await db.select().from(machines).where(eq(machines.id, query.machineId)).get();
      machineName = m?.name ?? null;
      isKonica = /konica|accurio/i.test(m?.brand ?? '') || m?.technology === 'Laser';
      isMimaki = /mimaki/i.test(m?.brand ?? '');
    }

    // Buscar jobs Mimaki se for máquina Mimaki
    let mimakiRows: typeof mimakiJobs.$inferSelect[] = [];
    if (isMimaki && query.machineId) {
      // Converter strings ISO para Date para comparação com timestamp
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      mimakiRows = await db
        .select()
        .from(mimakiJobs)
        .where(
          and(
            eq(mimakiJobs.machineId, query.machineId),
            gte(mimakiJobs.createdAt, startDate),
            lt(mimakiJobs.createdAt, endDate),
          )
        )
        .all();
    }

    // Totais HP (tinta ml + área m²) - usando big.js para precisão
    const totals = {
      jobs: rows.length,
      areaM2: sumPrecise(rows.map(r => r.mediaAreaM2 ?? 0)),
      inkTotalMl: sumPrecise(rows.map(r => r.inkTotalMl ?? 0)),
      inkCyanMl: sumPrecise(rows.map(r => r.inkCyanMl ?? 0)),
      inkLightCyanMl: sumPrecise(rows.map(r => r.inkLightCyanMl ?? 0)),
      inkMagentaMl: sumPrecise(rows.map(r => r.inkMagentaMl ?? 0)),
      inkLightMagentaMl: sumPrecise(rows.map(r => r.inkLightMagentaMl ?? 0)),
      inkYellowMl: sumPrecise(rows.map(r => r.inkYellowMl ?? 0)),
      inkBlackMl: sumPrecise(rows.map(r => r.inkBlackMl ?? 0)),
      inkOptimizerMl: sumPrecise(rows.map(r => r.inkOptimizerMl ?? 0)),
    };

    // Totais Konica (páginas/folhas) - usando big.js para precisão
    const konicaTotals = {
      totalPages: sumPrecise(rows.map(r => r.pages ?? 0)),
      totalSheets: sumPrecise(rows.map(r => r.sheets ?? 0)),
    };

    // Totais Mimaki (tinta cc + comprimento metros) - usando big.js para precisão
    const mimakiTotals = {
      jobs: mimakiRows.length,
      lengthMeters: sumPrecise(mimakiRows.map(r => r.lengthMeters ?? 0)),
      inkTotalCc: sumPrecise(mimakiRows.map(r => r.inkTotalCc ?? 0)),
      inkCyanCc: sumPrecise(mimakiRows.map(r => r.inkCyanCc ?? 0)),
      inkMagentaCc: sumPrecise(mimakiRows.map(r => r.inkMagentaCc ?? 0)),
      inkYellowCc: sumPrecise(mimakiRows.map(r => r.inkYellowCc ?? 0)),
      inkBlackCc: sumPrecise(mimakiRows.map(r => r.inkBlackCc ?? 0)),
      inkWhite1Cc: sumPrecise(mimakiRows.map(r => r.inkWhite1Cc ?? 0)),
      inkWhite2Cc: sumPrecise(mimakiRows.map(r => r.inkWhite2Cc ?? 0)),
      inkVarnish1Cc: sumPrecise(mimakiRows.map(r => r.inkVarnish1Cc ?? 0)),
      inkVarnish2Cc: sumPrecise(mimakiRows.map(r => r.inkVarnish2Cc ?? 0)),
    };

    // Consumo por tipo de mídia (área m² para HP, folhas para Konica, metros para Mimaki)
    const byMedia = new Map<string, { m2: number; sheets: number; jobs: number; lengthMeters: number }>();
    for (const r of rows) {
      const key = r.mediaType || 'Desconhecida';
      const entry = byMedia.get(key) ?? { m2: 0, sheets: 0, jobs: 0, lengthMeters: 0 };
      entry.m2 += r.mediaAreaM2 ?? 0;
      entry.sheets += r.sheets ?? 0;
      entry.jobs += 1;
      byMedia.set(key, entry);
    }
    // Adicionar consumo Mimaki por material bruto
    for (const r of mimakiRows) {
      const key = r.rawMaterialName || 'Desconhecido';
      const entry = byMedia.get(key) ?? { m2: 0, sheets: 0, jobs: 0, lengthMeters: 0 };
      entry.lengthMeters += r.lengthMeters ?? 0;
      entry.jobs += 1;
      byMedia.set(key, entry);
    }

    // Converter byMedia para array com valores precisos
    const byMediaArray = [...byMedia.entries()].map(([media, v]) => ({
      media,
      m2: sumPrecise([v.m2]),
      sheets: sumPrecise([v.sheets]),
      jobs: v.jobs,
      lengthMeters: sumPrecise([v.lengthMeters]),
    }));

    return {
      month,
      machineId: query.machineId ?? null,
      machineName,
      isKonica,
      isMimaki,
      totals,
      konicaTotals,
      mimakiTotals,
      byMedia: byMediaArray,
    };
  });
}
