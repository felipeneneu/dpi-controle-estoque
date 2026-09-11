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
- **Mimaki Tracker (M2M)**: Aplicação Electron que envia logs de impressão via API (autenticação via X-API-Secret).

### 4. Requisitos Mimaki (v1.0)
- **Integração M2M**: Receção de jobs de impressão Mimaki via endpoint REST (POST /api/integrations/mimaki/jobs).
- **Dedução Automática de Mídia**: Cálculo automático de metros lineares consumidos (`height_mm × pages × quantity_units / 1000`) e baixa no estoque quando o material é identificado.
- **Vinculação Manual**: Endpoint para vincular material a jobs não identificados automaticamente (POST /api/integrations/mimaki/jobs/:id/bind-material).
- **Painel Informativo**: Exibição de informações da máquina Mimaki na interface (sem telemetria de rede).
- **Eventos em Tempo Real**: Notificação via Socket.IO (`mimaki:unmatched_material`) quando material não é identificado.

### 5. Privacidade do Chat Bot
- Respostas dos comandos do bot (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) são enviadas como DM (mensagem privada) para o remetente, não broadcast na sala.

### 6. Notificações Dinâmicas
- Badge no sidebar de Estoque exibe contagem real de notificações não lidas (não valor fixo).
