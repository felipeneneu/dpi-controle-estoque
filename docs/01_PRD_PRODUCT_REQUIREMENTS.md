# 📄 Product Requirements Document (PRD)
## Sistema de Controle de Estoque & Maquinário - Gráfica / Comunicação Visual

---

### 1. Visão Geral do Produto
O **Sistema de Estoque Gráfico** é uma aplicação desktop de alta performance (Next.js + Electron + Turso LibSQL) projetada para otimizar o fluxo de insumos (papéis, bobinas de vinil, tintas) e equipamentos em uma gráfica. O sistema garante operação contínua mesmo offline via sincronização de réplica local do Turso.

### 2. Objetivos Principais
- **Zero Downtime por Conectividade**: Operação local resiliente a quedas de internet.
- **Prevenção de Paradas de Produção**: Alertas inteligentes de estoque crítico (via WhatsApp/Telegram às 07:35 e 17:30).
- **Controle Operacional Rígido (RBAC)**: Restrição de acessos para evitar exclusões ou edições indevidas por operadores.

### 3. Perfis de Usuário (Personas)
- **Felipe Neneu (Dev / Master Admin)**: Acesso total ao banco, logs, suporte e configurações do sistema.
- **Gerente de Produção / Admin**: Gerencia cadastros de máquinas, insumos, relatórios e ajustes de estoque.
- **Operador de Balcão / Produção**: Registra apenas saídas/baixas de materiais em Ordens de Serviço (OS).
