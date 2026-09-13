# Plano: Toner Konica + Excluir Usuário + Status Accurio

## Objetivo
Corrigir 3 problemas: unidade de toner Konica, exclusão de usuário, e extrair dados de status em tempo real da Accurio.

---

## Problemas Identificados

| # | Problema | Causa |
|---|---------|-------|
| 1 | Toner Konica mostra "(g)" | `amount` vem em gramas, código trata como % |
| 2 | Não exclui usuário | Provável erro de autorização (só DEV_MASTER) |
| 3 | Status Accurio incompleto | `productionData.fcgi` não está sendo buscado |

---

## Tarefas

### 1. Corrigir unidade de toner Konica
**Problema:** O campo `amount` do `deviceInfo.fcgi` vem em gramas (ex: 200g), mas o código faz `Math.min(100, amount)` tratando como porcentagem.

**Solução:** 
- Detectar se `amount` > 100 (gramas) e normalizar para %
- Ou exibir valor original com unidade correta
- Precisa saber capacidade do toner (ex: 300g = 100%)

**Arquivo:** `grafica-app/backend/src/agents/konica/device-info.ts`

**Verificar:** Toner mostra % correto, não (g).

---

### 2. Corrigir exclusão de usuário
**Problema:** Endpoint `DELETE /api/users/:id` requer `DEV_MASTER`. Se o usuário logado não tem esse role, recebe 403.

**Solução:**
- Verificar se o middleware `authorize` está funcionando corretamente
- Verificar se o JWT contém o role correto
- Adicionar toast de erro mais específico (403 vs outros)

**Arquivos:**
- `grafica-app/backend/src/routes/users.ts` — endpoint DELETE
- `grafica-app/src/app/(dashboard)/config/page.tsx` — botão + dialog

**Verificar:** Usuário DEV_MASTER consegue excluir outros usuários.

---

### 3. Buscar `productionData.fcgi` — status em tempo real
**Problema:** O endpoint `productionData.fcgi` não está sendo buscado. Este endpoint retorna dados de impressão em tempo real.

**Solução:**
- Adicionar `fetchProductionData()` no `fetcher.ts`
- Criar parser para extrair dados de produção
- Adicionar campos na tabela `machine_telemetry` se necessário
- Exibir no frontend (status de impressão atual)

**Arquivos:**
- `grafica-app/backend/src/agents/konica/fetcher.ts` — nova função
- `grafica-app/backend/src/agents/konica/device-info.ts` — parser
- `grafica-app/backend/src/agents/konica/telemetry-store.ts` — persistência

**Verificar:** Dados de produção aparecem no painel de telemetria.

---

### 4. Extrair campos extras do `deviceInfo.fcgi`
**Problema:** Alguns campos podem não estar sendo extraídos.

**Solução:** Revisar `parseDeviceInfo()` para garantir que todos os campos relevantes são extraídos:
- `printerInformation.printerStatus[]` — mensagens de status
- `printerInformation.statusCount` — severidade
- `storedJobInformation.holdJobCount` — jobs em espera

**Arquivo:** `grafica-app/backend/src/agents/konica/device-info.ts`

---

## Concluído quando
- [ ] Toner Konica mostra % correto (não gramas)
- [ ] Usuário DEV_MASTER consegue excluir outros usuários
- [ ] `productionData.fcgi` é buscado e exibido
- [ ] Status em tempo real aparece no painel
