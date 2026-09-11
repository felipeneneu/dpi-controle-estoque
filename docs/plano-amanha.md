# Plano de amanhã — DPI Controle de Estoque

Data: 04/09/2026

## Contexto
Phases A (telemetria ao vivo), B (relatório mensal) e C (canais por equipamento) já implementadas
e validadas (typecheck + lint limpos). Restam passos operacionais que dependem do ambiente real
e de decisões do usuário.

## Prioridades

### 1. Aplicar a migração pendente (bloqueia tudo que toca telemetria)
- Migração `0004_watery_owl.sql` ainda NÃO aplicada no banco Turso cloud.
- Ela cria a tabela `machine_telemetry` e as colunas `code`/`label` de `stock_items`.
- **Ação:** iniciar o backend (`npm run dev`) — a migração aplica sozinha via `migrate()` no `server.ts`.
- **Não** rodar `db:push` no cloud sem aval do usuário.
- **Verificação:** conferir se a tabela `machine_telemetry` existe e se o servidor sobe sem erro.

### 2. Seed dos cartuchos simulados (2 por cor, HP 330)
- Rodar no backend: `npm run seed:hp:inks`.
- Cria/atualiza 7 itens `hp_tinta-*` (C, LC, M, LM, Y, K, OP) com 1550 ml (2 cartuchos de 775 ml),
  mínimo 775 ml, vinculados à máquina HP 330.
- **Importante:** nomes de SKU devem bater com `INK_COLOR_MAP` do `stock-deductor.ts`
  (`hp_tinta-cyan`, `hp_tinta-light-cyan`, `hp_tinta-magenta`, `hp_tinta-light-magenta`,
  `hp_tinta-yellow`, `hp_tinta-black`, `hp_tinta-optimizer`) para o rebaixamento automático funcionar.
- **Depois:** usuário valida as quantidades reais de tinta em estoque.

### 3. Validar telemetria ao vivo contra a impressora real (HP Latex 330)
- Endpoint: `http://192.168.234.10/hp/device/webAccess/printer_status_core.jsp` (pipe-delimited `|`).
- HTML: `http://192.168.234.10/hp/device/webAccess/index.htm?content=supplies`.
- Fonte dos detalhes: `docs/HP_LATEX_330_DATA_MAP.md`.
- **Risco:** parser de mídia/tinta por regex ainda não testado com a saída real — pode precisar ajustes.
- **Verificação:** abrir `GET /api/machines/:id/telemetry` e conferir níveis de tinta, mídia carregada,
  status, % de manutenção e temperaturas.
- Garantir que o loop do agente nunca quebra se o fetch falhar (não derruba o poll).

### 4. Build de produção (não bloqueado, mas recomendado)
- Rodar `npm run build` no frontend (static export) para confirmar que a reestruturação do Phase C
  (query param em vez de rota dinâmica) não quebra o build.

## Backlog (opcional / futuro)
- [ ] Conectar evento Socket.IO `machine:telemetry` no frontend para atualização live (push),
      hoje usa refetch de 30s via react-query.
- [ ] Reconciliar m² por mídia com contadores de vida útil da impressora (`?content=usage`) como
      refinamento do Phase B.

## Critérios de aceite para "day done"
- [ ] Migração aplicada e servidor backend sobe limpo.
- [ ] Seed das tintas HP refletido no estoque (7 cores, 1550 ml cada).
- [ ] Telemetria real do HP 330 aparece no painel/canal da máquina com dados corretos.
- [ ] Build de produção sem erros.
