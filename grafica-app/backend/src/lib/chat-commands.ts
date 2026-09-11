import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { stockItems, machines, machineTelemetry, printJobs, notifications } from '../db/schema.js';

export interface CommandResult {
  content: string;
  isPrivate: boolean;
}

type CommandHandler = (userId: string) => Promise<CommandResult>;

const commands = new Map<string, { description: string; handler: CommandHandler }>();

commands.set('help', {
  description: 'Lista todos os comandos disponíveis',
  handler: async () => ({
    content: [
      '**Comandos disponíveis:**',
      '',
      '`/help` — Lista este menu de ajuda',
      '`/status` — Status de todas as máquinas',
      '`/estoque` — Resumo do estoque (itens baixos)',
      '`/jobs` — Últimos 5 jobs processados',
      '`/alertas` — Notificações ativas',
    ].join('\n'),
    isPrivate: true,
  }),
});

commands.set('status', {
  description: 'Status das máquinas',
  handler: async () => {
    try {
      const allMachines = await db.select().from(machines).all();
      if (allMachines.length === 0) return { content: 'Nenhuma máquina cadastrada.', isPrivate: true };

      const lines = ['**Status das máquinas:**', ''];
      for (const m of allMachines) {
        const telemetry = await db
          .select()
          .from(machineTelemetry)
          .where(eq(machineTelemetry.machineId, m.id))
          .orderBy(desc(machineTelemetry.createdAt))
          .limit(1)
          .get();

        const status = m.status === 'ACTIVE' ? '🟢' : m.status === 'MAINTENANCE' ? '🟡' : '🔴';
        const online = telemetry?.online ? 'Online' : 'Offline';

        lines.push(`${status} **${m.name}** (${m.model})`);
        lines.push(`   Status: ${online} | IP: ${m.ip || 'N/A'}`);

        if (telemetry) {
          if (m.technology === 'INKJET') {
            const ink = [
              telemetry.inkCyanMl != null ? `C:${Math.round(telemetry.inkCyanMl)}ml` : '',
              telemetry.inkMagentaMl != null ? `M:${Math.round(telemetry.inkMagentaMl)}ml` : '',
              telemetry.inkYellowMl != null ? `Y:${Math.round(telemetry.inkYellowMl)}ml` : '',
              telemetry.inkBlackMl != null ? `K:${Math.round(telemetry.inkBlackMl)}ml` : '',
            ].filter(Boolean).join(' | ');
            if (ink) lines.push(`   Tinta: ${ink}`);
          } else {
            const toner = [
              telemetry.tonerCyanPct != null ? `C:${Math.round(telemetry.tonerCyanPct)}%` : '',
              telemetry.tonerMagentaPct != null ? `M:${Math.round(telemetry.tonerMagentaPct)}%` : '',
              telemetry.tonerYellowPct != null ? `Y:${Math.round(telemetry.tonerYellowPct)}%` : '',
              telemetry.tonerBlackPct != null ? `K:${Math.round(telemetry.tonerBlackPct)}%` : '',
            ].filter(Boolean).join(' | ');
            if (toner) lines.push(`   Toner: ${toner}`);
          }
        }
        lines.push('');
      }
      return { content: lines.join('\n'), isPrivate: true };
    } catch (err) {
      console.error('[chat-command] /status error:', err);
      return { content: 'Erro ao obter status das máquinas. Tente novamente.', isPrivate: true };
    }
  },
});

commands.set('estoque', {
  description: 'Resumo do estoque',
  handler: async () => {
    try {
      const items = await db.select().from(stockItems).all();
      if (items.length === 0) return { content: 'Estoque vazio.', isPrivate: true };

      const low = items.filter((i) => i.currentQuantity > 0 && i.currentQuantity <= i.minQuantity);
      const out = items.filter((i) => i.currentQuantity === 0);

      const lines = ['**Resumo do estoque:**', ''];
      lines.push(`Total: ${items.length} itens`);

      if (out.length > 0) {
        lines.push('');
        lines.push('**🔴 Zerados:**');
        out.forEach((i) => lines.push(`  • ${i.name} — ${i.currentQuantity} ${i.unit}`));
      }
      if (low.length > 0) {
        lines.push('');
        lines.push('**🟡 Baixos:**');
        low.forEach((i) => lines.push(`  • ${i.name} — ${i.currentQuantity}/${i.minQuantity} ${i.unit}`));
      }
      if (low.length === 0 && out.length === 0) {
        lines.push('✅ Todos os itens acima do mínimo.');
      }

      return { content: lines.join('\n'), isPrivate: true };
    } catch (err) {
      console.error('[chat-command] /estoque error:', err);
      return { content: 'Erro ao consultar estoque. Tente novamente.', isPrivate: true };
    }
  },
});

commands.set('jobs', {
  description: 'Últimos 5 jobs',
  handler: async () => {
    try {
      const jobs = await db
        .select()
        .from(printJobs)
        .orderBy(desc(printJobs.createdAt))
        .limit(5)
        .all();

      if (jobs.length === 0) return { content: 'Nenhum job registrado.', isPrivate: true };

      const lines = ['**Últimos 5 jobs:**', ''];
      for (const j of jobs) {
        const status = j.status === 'COMPLETED' ? '✅' : j.status === 'FAILED' ? '❌' : j.status === 'PRINTING' ? '🖨️' : '⏳';
        lines.push(`${status} **${j.jobName || 'Sem nome'}** — ${j.status}`);
        if (j.mediaType) lines.push(`   Material: ${j.mediaType}`);
        if (j.sheets) lines.push(`   Fichas: ${j.sheets}`);
        lines.push('');
      }
      return { content: lines.join('\n'), isPrivate: true };
    } catch (err) {
      console.error('[chat-command] /jobs error:', err);
      return { content: 'Erro ao consultar jobs. Tente novamente.', isPrivate: true };
    }
  },
});

commands.set('alertas', {
  description: 'Notificações ativas',
  handler: async () => {
    try {
      const alerts = await db
        .select()
        .from(notifications)
        .where(eq(notifications.read, false))
        .orderBy(desc(notifications.createdAt))
        .limit(10)
        .all();

      if (alerts.length === 0) return { content: 'Nenhuma notificação ativa.', isPrivate: true };

      const lines = ['**Notificações ativas:**', ''];
      for (const a of alerts) {
        const icon = a.type === 'warning' ? '⚠️' : a.type === 'error' ? '🔴' : 'ℹ️';
        lines.push(`${icon} **${a.title}**`);
        if (a.body) lines.push(`   ${a.body}`);
        lines.push('');
      }
      return { content: lines.join('\n'), isPrivate: true };
    } catch (err) {
      console.error('[chat-command] /alertas error:', err);
      return { content: 'Erro ao consultar notificações. Tente novamente.', isPrivate: true };
    }
  },
});

export function isCommand(content: string): boolean {
  return content.trim().startsWith('/');
}

export function getCommandsList(): { name: string; description: string }[] {
  return Array.from(commands.entries()).map(([name, cmd]) => ({
    name: `/${name}`,
    description: cmd.description,
  }));
}

export async function executeCommand(content: string, userId: string): Promise<CommandResult | null> {
  const cmdName = content.trim().split(/\s+/)[0].toLowerCase().replace('/', '');
  const cmd = commands.get(cmdName);
  if (!cmd) {
    return {
      content: `Comando desconhecido: \`${cmdName}\`. Digite \`/help\` para ver os comandos disponíveis.`,
      isPrivate: true,
    };
  }
  return cmd.handler(userId);
}
