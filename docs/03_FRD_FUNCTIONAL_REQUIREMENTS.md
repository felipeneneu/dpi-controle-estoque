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
