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
