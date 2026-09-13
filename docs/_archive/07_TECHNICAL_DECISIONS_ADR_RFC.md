# ⚖️ Architecture Decision Records (ADRs) & RFCs

---

### ADR 001: Adoção do Turso (LibSQL) com Embedded Replicas
- **Status**: Aprovado
- **Contexto**: A gráfica necessita de alta disponibilidade local. Se o link de internet falhar, a produção não pode parar.
- **Decisão**: Substituir o MySQL tradicional pelo Turso (LibSQL). Utilizar sincronização de réplica local `.db` nas máquinas para garantir leituras e escritas offline.
- **Consequências**: Zero custos de servidor de banco na empresa; tolerância total a falhas de rede.

### ADR 002: Matriz RBAC para Proteção de Dados
- **Status**: Aprovado
- **Contexto**: Operadores de balcão ou produção podem alterar ou deletar itens por engano.
- **Decisão**: Implementar controle de acesso baseado em funções (`DEV_MASTER`, `ADMIN`, `OPERATOR`) validado por JWT nos endpoints da API e ocultado na UI.

### ADR 003: Autenticação M2M para Integração Mimaki
- **Status**: Aprovado
- **Contexto**: O Mimaki Tracker Electron precisa enviar logs de impressão para o GraficaOS sem autenticação de usuário (aplicação máquina-máquina).
- **Decisão**: Implementar autenticação via `X-API-Secret` (header) ou `Bearer` token no endpoint `POST /api/integrations/mimaki/jobs`. O secret é configurável via variável de ambiente `MIMAKI_INTEGRATION_SECRET` ou tabela `settings`.
- **Consequências**: 
  - Segurança: secret longo e aleatório, não exposto no frontend
  - Flexibilidade: fallback para tabela `settings` caso variável de ambiente não esteja configurada
  - Separação: endpoint M2M usa `m2mAuth`, endpoints de vinculação usam JWT padrão

### ADR 004: Respostas do Bot como DM (Privacidade)
- **Status**: Aprovado
- **Contexto**: Comandos do bot (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) retornam informações que podem ser sensíveis (níveis de estoque, status de máquinas).
- **Decisão**: Respostas do bot são armazenadas em sala `dm:system:<userId>` e emitidas via Socket.IO apenas para o remetente (`user:<userId>`), não para a sala original.
- **Consequências**: 
  - Privacidade: informações de estoque não são expostas publicamente
  - UX: usuário vê resposta em DM separada da conversa da sala
  - Auditoria: mensagens ficam registradas no banco com remetente `system`

### ADR 005: Dedução Automática de Mídia Mimaki
- **Status**: Aprovado
- **Contexto**: Jobs Mimaki precisam deduzir automaticamente a mídia consumida do estoque.
- **Decisão**: Ao receber job via M2M, o backend calcula `length_meters = (height_mm × pages × quantity_units) / 1000` e busca material por nome (`LIKE`) na tabela `stock_items`. Se encontrado, deduz automaticamente (transação OUT). Se não encontrado, marca como `PENDING_BIND` e notifica via Socket.IO.
- **Consequências**:
  - Automação: redução manual de estoque
  - Flexibilidade: vinculação manual para materiais não identificados
  - Auditoria: transações registradas com reason "Mimaki auto-deduction" ou "Mimaki manual bind"
