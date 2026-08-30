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
