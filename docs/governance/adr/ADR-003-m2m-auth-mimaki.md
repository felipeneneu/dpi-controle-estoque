# ADR-003 — Autenticação M2M para Integração Mimaki

- **Status:** Aprovado
- **Data:** (anterior à reorganização de 2026-09-12)
- **Owner:** Felipe
- **Domínio:** integrations / security
- **Links:** cita **BR-018**; contrato completo em `docs/integrations/MIMAKI.md`
- **Fonte original:** `docs/07_TECHNICAL_DECISIONS_ADR_RFC.md` (arquivado)

## Contexto
O Mimaki Tracker Electron precisa enviar logs de impressão para o GraficaOS sem autenticação de usuário (aplicação máquina-máquina).

## Decisão
Implementar autenticação via `X-API-Secret` (header) ou `Bearer` token no endpoint `POST /api/integrations/mimaki/jobs`. O secret é configurável via variável de ambiente `MIMAKI_INTEGRATION_SECRET` ou tabela `settings`.

## Consequências
- Segurança: secret longo e aleatório, não exposto no frontend.
- Flexibilidade: fallback para tabela `settings` caso a variável de ambiente não esteja configurada.
- Separação: endpoint M2M usa `m2mAuth`; endpoints de vinculação usam JWT padrão.