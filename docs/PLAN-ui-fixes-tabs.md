# Plano: UI Fixes — Materiais, Login, Jobs, Config

## Objetivo
Corrigir botão de editar materiais, login automático, jobs OS como coluna, excluir usuário e separar config por tabs.

---

## Tarefas

### 1. MateriaisTab — Editar quantidade no estoque
**Problema:** Botão "Editar" na aba Materiais não faz nada (sem onClick).

**Solução:** 
- Adicionar onClick no botão que abre dialog de edição
- Dialog permite editar `currentQuantity` e `minQuantity` de cada material vinculado
- Toast de sucesso ao salvar

**Arquivos:**
- `grafica-app/src/app/(dashboard)/maquinas/page.tsx` — MateriaisTab (linha 334)
- `grafica-app/src/lib/queries/stock.ts` — Adicionar mutation `useUpdateStockItem`

**Verificar:** Clicar Editar → dialog abre → editar quantidade → salvar → toast sucesso.

---

### 2. Toast de feedback ao debitar estoque
**Problema:** Débito automático de estoque não mostra toast quando ocorre.

**Solução:**
- Emitir evento Socket.IO `stock:deducted` após cada débito
- Frontend escuta e mostra toast com nome do item e quantidade debitada

**Arquivos:**
- `grafica-app/backend/src/agents/konica/stock-deductor.ts` — Emitir evento após débito
- `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts` — Emitir evento após débito
- `grafica-app/src/components/notifications-provider.tsx` — Escutar evento e mostrar toast

**Verificar:** Job completo → toast "Debitado: Couché 33x48 150g - 50 folhas".

---

### 3. Login — App abre deslogado
**Problema:** `npm run app` abre já logado porque token fica no localStorage.

**Solução:**
- Chamar `validateToken()` no AppGate ao mount
- Se token inválido ou expirado, limpar sessão e redirecionar `/auth`
- Não usar "Remember me" com senha em plaintext (remover essa feature)

**Arquivos:**
- `grafica-app/src/components/app-gate.tsx` — Já implementado na tarefa anterior
- `grafica-app/src/app/auth/page.tsx` — Remover armazenamento de senha

**Verificar:** Fechar app → reabrir → tela de login.

---

### 4. Jobs tab — OS como coluna na tabela
**Problema:** Número da OS é exibido como Badge (tag) dentro da coluna Job.

**Solução:**
- Criar coluna separada "OS" antes da coluna "Job"
- OS vem de `osNumber` ou é parseada do nome do job
- Coluna com largura fixa, ordenável

**Arquivos:**
- `grafica-app/src/components/machine-jobs-table.tsx` — Adicionar coluna OS

**Verificar:** Tabela mostra coluna "OS" separada → busca por OS funciona.

---

### 5. Config — Excluir usuário
**Problema:** Não existe botão de excluir usuário na UI (backend já tem DELETE).

**Solução:**
- Adicionar mutation `useDeleteUser` no frontend
- Adicionar botão "Excluir" na tabela de usuários com confirmação
- Toast sucesso ao excluir

**Arquivos:**
- `grafica-app/src/lib/queries/users.ts` — Adicionar `useDeleteUser`
- `grafica-app/src/app/(dashboard)/config/page.tsx` — Adicionar botão excluir

**Verificar:** Clicar Excluir → dialog confirmação → confirmar → toast sucesso → usuário removido.

---

### 6. Config — Separar conteúdo por tabs
**Problema:** Página de config mistura usuários, WhatsApp e conexão.

**Solução:**
- Usar componente Tabs para separar:
  - **Usuários** — Tabela de usuários + CRUD
  - **WhatsApp** — Painel de configuração
  - **Conexão** — URL do backend + informações de rede

**Arquivos:**
- `grafica-app/src/app/(dashboard)/config/page.tsx` — Reestruturar com Tabs

**Verificar:** 3 tabs funcionais → conteúdo separado → navegação OK.

---

## Concluído quando
- [ ] MateriaisTab Editar funciona com dialog de quantidade
- [ ] Toast aparece ao debitar estoque automaticamente
- [ ] App abre na tela de login (não logado)
- [ ] OS é coluna separada na tabela de jobs
- [ ] Botão Excluir usuário funciona
- [ ] Config separado em 3 tabs
- [ ] Typecheck + lint passam
