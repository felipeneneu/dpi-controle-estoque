# Plano: Login, Avatares e Konica

## Objetivo
Corrigir o fluxo de login do Electron, servir avatares via backend, verificar implementação Konica e criar páginas de consumo individualizadas por impressora.

---

## Tarefas

### 1. Corrigir fluxo de login no Electron
**Problema:** O .exe abre já conectado (com dados anteriores no localStorage) em vez de mostrar a tela de login.

**Arquivos afetados:**
- `grafica-app/src/stores/auth-store.ts` — Limpar sessão no mount se token inválido
- `grafica-app/src/lib/api.ts` — Adicionar validação de token no startup
- `grafica-app/src/components/app-gate.tsx` — Verificar autenticação antes de mostrar UI

**Solução:** No `auth-store.ts`, verificar se o token ainda é válido ao inicializar. Se não, limpar localStorage e redirecionar para `/auth`.

**Verificar:** Abrir .exe → deve mostrar tela de login → fazer login → funciona normalmente.

---

### 2. Servir avatares via backend para Electron
**Problema:** Avatares precisam ser servidos pelo backend para clientes Electron.

**Arquivos afetados:**
- `grafica-app/backend/src/app.ts` — Já serve `/users/` via fastifyStatic ✓
- `grafica-app/src/lib/api.ts` — `avatarUrl()` já resolve contra `backendUrl()` ✓
- `grafica-app/src/components/avatar-picker.tsx` — Verificar funcionamento

**Status:** Implementado. O backend já serve `/users/` e `avatarUrl()` já resolve corretamente.

**Verificar:** Criar usuário com avatar → avatar aparece no chat/perfil no Electron.

---

### 3. Verificar implementação Konica existente
**Itens para verificar:**

| Item | Arquivo | Status |
|------|---------|--------|
| device-info.ts fetch | `backend/src/agents/konica/device-info.ts` | ✅ Implementado |
| Telemetria snapshot | `backend/src/agents/konica/telemetry-store.ts` | ✅ Implementado |
| Polling no agent loop | `backend/src/agents/konica/index.ts:57-62` | ✅ Implementado |
| Route por tipo | `backend/src/routes/machines.ts:268-289` | ✅ Implementado |
| Sheet debit rounding | `backend/src/agents/konica/stock-deductor.ts:163,167` | ✅ `Math.floor` |
| Frontend types | `src/lib/api.ts:206-265` | ✅ `KonicaTray`, `MachineTelemetry` |
| KonicaTelemetryPanel | `src/components/konica-telemetry-panel.tsx` | ✅ Implementado |

**Ação:** Testar live probe `deviceInfo → telemetry` e verificar se tipos batem.

**Verificar:** `GET /api/machines/:id/telemetry` retorna dados CMYK + trays para Konica.

---

### 4. Página de consumo individual por impressora (Konica vs HP)
**Problema:** A página de consumo da Accurio está puxando dados da HP (ink ml). Cada impressora tem materiais, consumo e telemetria diferentes.

**Arquivos afetados:**
- `grafica-app/src/app/(dashboard)/maquinas/page.tsx` — `ConsumoTab` genérico
- `grafica-app/backend/src/routes/reports.ts` — `GET /api/reports/consumption`

**Solução:** Criar `KonicaConsumoTab` separado que mostra:
- Total de páginas/folhas impressas (não ml de tinta)
- Consumo por tipo de papel/mídia
- Débito de toner estimado (baseado em contagem de páginas)

**Verificar:** Abrir canal da Konica → aba Consumo → mostrar dados de páginas/folhas, não ml de tinta.

---

### 5. Toner por contagem de páginas (fallback)
**Problema:** Toner não é exposto por job no PrintManager (`TONER_EXPOSED = false`).

**Solução:** Sistema de telemetria baseado em contagem total de impressões:
1. Criar 1 item de toner de cada cor (CMYK) no estoque com 100%
2. Rastrear total de páginas impressas via `totalPageCount` do deviceInfo
3. Calcular % de telemetria baseado na capacidade estimada do toner
4. Debitar conforme a máquina vai gastando

**Arquivos afetados:**
- `grafica-app/backend/src/agents/konica/device-info.ts` — Adicionar `totalPageCount` ao parser
- `grafica-app/backend/src/agents/konica/telemetry-store.ts` — Calcular % de telemetria
- `grafica-app/backend/src/agents/konica/stock-deductor.ts` — Habilitar débito de toner
- `grafica-app/backend/scripts/seed-konica-materials.ts` — Seed toner CMYK 100%

**Verificar:** 
- Seed cria 4 toners (CMYK) no estoque
- Telemetria mostra % baseado em contagem de páginas
- Débito automático ao completar jobs

---

## Concluído quando
- [ ] .exe abre na tela de login (não conectado)
- [ ] Avatares funcionam no Electron via backend
- [ ] Live probe Konica retorna telemetria correta
- [ ] Página de consumo Konica mostra folhas/páginas (não ml)
- [ ] Toner é debitado baseado em contagem de páginas
- [ ] Typecheck backend + frontend passa
- [ ] Lint dos arquivos konica está limpo
