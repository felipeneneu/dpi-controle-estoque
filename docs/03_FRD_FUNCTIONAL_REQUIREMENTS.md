# 📌 Functional Requirements Document (FRD)

---

### Requisitos Funcionais (RF)

- **`RF-001` Cadastro de Mídias e Insumos**: Suporte a bobinas (metros lineares) e cut-sheets (quantidade de folhas), tintas (ml/L) com limites mínimos.
- **`RF-002` Cadastro Escalável de Maquinário**: Cadastro de impressoras (Konica Minolta, Mimaki, HP e expansões) com tecnologia e status operacional.
- **`RF-003` Vinculação de Compatibilidade**: Relacionamento N:N entre insumo e impressora.
- **`RF-004` Baixa Rápida de Estoque**: Registros parciais de metros/folhas vinculados à Ordem de Serviço.
- **`RF-005` Sistema de Alerta Inteligente**: Disparo programado (07:35 e 17:30) via WhatsApp (`@whiskeysockets/baileys`) ou Telegram.
- **`RF-006` Sincronização em Tempo Real**: Atualização instantânea do grid nos 3 PCs via WebSockets quando um item sofrer alteração.
- **`RF-007` Role-Based Access Control (RBAC)**: Autenticação via JWT com restrição granular de permissões por tela e ação.
- **`RF-008` Integração Mimaki M2M**: Receção de jobs de impressão Mimaki via API REST com autenticação X-API-Secret. Dedução automática de mídia do estoque quando material é identificado.
- **`RF-009` Vinculação de Material Mimaki**: Endpoint para vincular manualmente um item de estoque a um job Mimaki com material não identificado.
- **`RF-010` Chat Bot DM**: Respostas de comandos do bot (/help, /status, /estoque, /jobs, /alertas) são enviadas como mensagem privada (DM) para o remetente.
- **`RF-011` Notificações Dinâmicas**: Badge no sidebar de Estoque exibe contagem real de notificações não lidas em tempo real.
- **`RF-012` Painel Mimaki**: Exibição de informações da máquina Mimaki na interface (sem telemetria de rede exportada).
