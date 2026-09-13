> **Versão:** 1.0.0 \
> **Status:** ATIVO \
> **Owner:** Felipe \
> **Última atualização:** 2026-09-12 \
> **Origem:** migrado de `docs/04_USER_STORIES.md` (MIGRAÇÃO F5 — ver docs/00_DOCS_INDEX.md).\

# 👤 User Stories (Histórias de Usuário)

---

### `US-01` Baixa Rápida no Balcão
- **Como**: Operador de Balcão
- **Quero**: Dar baixa de 12.5 metros de Vinil Gloss diretamente pelo modal do card de produto.
- **Para**: Que a produção saiba exatamente a metragem disponível na bobina sem precisar ir até o depósito medir.
- **Critério de Aceite**: Ação concluída em menos de 3 cliques; atualização imediata nos 3 computadores via Socket.io.

### `US-02` Alerta de Fechamento de Expediente
- **Como**: Gerente da Gráfica
- **Quero**: Receber no WhatsApp às 17:30 a lista de materiais que entraram em estado crítico (`LOW_STOCK`).
- **Para**: Comprar os insumos antes do início do próximo dia útil.
- **Critério de Aceite**: Mensagem formatada enviada automaticamente via fila `p-queue` + `baileys`.

### `US-03` Bloqueio de Ações Críticas (RBAC)
- **Como**: Desenvolvedor / Administrador
- **Quero**: Que operadores não consigam deletar registros de máquinas ou alterar preços unitários.
- **Para**: Preservar a integridade auditável do banco de dados.
- **Critério de Aceite**: O botão de exclusão fica oculto ou desabilitado para o role `OPERATOR`, retornando HTTP `403 Forbidden` na API se for chamado diretamente.

### `US-04` Receber Job Mimaki Automaticamente
- **Como**: Sistema (Mimaki Tracker Electron)
- **Quero**: Enviar logs de impressão Mimaki via API M2M para o GraficaOS.
- **Para**: Que o estoque seja deduzido automaticamente quando o material é identificado.
- **Critério de Aceite**: Endpoint POST /api/integrations/mimaki/jobs recebe o job, calcula metros lineares e deduz do estoque se material for identificado. Resposta 201 com job_id e material_status.

### `US-05` Vincular Material a Job Mimaki
- **Como**: Operador de Estoque
- **Quero**: Vincular manualmente um item de estoque a um job Mimaki com material não identificado.
- **Para**: Manter o controle de estoque preciso mesmo quando o bot não identifica o material.
- **Critério de Aceite**: Endpoint POST /api/integrations/mimaki/jobs/:id/bind-material atualiza o status para BOUND e deduz a quantidade do estoque.

### `US-06` Resposta Privada do Bot no Chat
- **Como**: Qualquer usuário do chat
- **Quero**: Que as respostas dos comandos do bot (/help, /status, /estoque, /jobs, /alertas) sejam enviadas apenas para mim.
- **Para**: Que informações sensíveis de estoque e máquinas não sejam expostas publicamente na sala.
- **Critério de Aceite**: Resposta do bot é armazenada em DM (dm:system:<userId>) e emitida via Socket.IO apenas para o remetente.

### `US-07` Badge Dinâmico de Notificações
- **Como**: Operador de Estoque
- **Quero**: Que o badge no sidebar de Estoque mostre a contagem real de notificações não lidas.
- **Para**: Saber imediatamente quantas notificações pendentes tenho sem precisar abrir a tela.
- **Critério de Aceite**: Badge atualiza em tempo real via Socket.IO (evento notification:new) e exibe número exato de notificações não lidas.

### `US-08` Visualizar Informações Mimaki
- **Como**: Operador de Produção
- **Quero**: Ver informações da máquina Mimaki na interface (painel informativo).
- **Para**: Monitorar o status da Mimaki mesmo sem telemetria de rede.
- **Critério de Aceite**: Página da máquina Mimaki exibe painel com informações estáticas (modelo, IP, status) sem dados de telemetria em tempo real.

