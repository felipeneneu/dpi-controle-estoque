import schedule from 'node-schedule';
import { db } from '../db/index.js';
import { printJobs, mimakiJobs, bobinas } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { sendToRecipients } from './whatsapp.js';
import type { FastifyInstance } from 'fastify';

export function setupSchedulers(app: FastifyInstance) {
  // Alerta às 17:10 (BRT) de segunda a sexta para conferência de materiais pendentes
  // Fuso horário do sistema geralmente é UTC. BRT = UTC-3. 17:10 BRT = 20:10 UTC.
  // Usando TZ="America/Sao_Paulo" via cron é o ideal se o node-schedule suportar.
  
  schedule.scheduleJob({ hour: 17, minute: 10, tz: 'America/Sao_Paulo', dayOfWeek: [new schedule.Range(1, 5)] }, async () => {
    try {
      // Procurar jobs órfãos criados nas últimas 24h (para evitar spans gigantes, ou apenas pendentes gerais)
      const hpOrphans = await db.select().from(printJobs).where(
        eq(printJobs.materialStatus, 'PENDING_BIND')
      ).all();

      const mimakiOrphans = await db.select().from(mimakiJobs).where(
        eq(mimakiJobs.materialStatus, 'PENDING_BIND')
      ).all();

      const totalOrphans = hpOrphans.length + mimakiOrphans.length;

      if (totalOrphans > 0) {
        const msg = `⚠️ *Alerta de Estoque: Fechamento (17:10)*\nExistem *${totalOrphans}* impressões aguardando vínculo com bobina/mídia.\nPor favor, acesse o painel de Equipamentos e regularize antes do fim do turno.`;
        
        await sendToRecipients(msg);

        // Notifica dashboard
        app.io.to('estoque').emit('notification:toast', {
          type: 'warning',
          title: 'Fechamento de Turno',
          message: `Existem ${totalOrphans} jobs pendentes de vínculo.`,
        });
      } else {
         // Opcional: Se quiser dar parabéns
         // console.log('[Scheduler] 17:10 - Sem pendências.');
      }
    } catch (err) {
      console.error('[Scheduler] Erro ao rodar alerta das 17:10', err);
    }
  });

  console.log('[Scheduler] Inicializado (Alerta 17:10 ativo)');
}
