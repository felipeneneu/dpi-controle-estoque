# Plano: Avatar no create + Validação do form + TanStack Query/Zustand (app inteiro)

---

## Status: PLANO / AGUARDANDO APROVAÇÃO

---

## 1. Diagnóstico (Causa Raiz)

**Bug relatado (config/page.tsx):**
1. **Não dá para selecionar avatar ao criar usuário** — o dialog "Novo Usuário" (`(dashboard)/config/page.tsx:332-372`) só tem Nome, E-mail, Senha e Perfil. O seletor de fotos (`/api/user-photos`) existe **apenas** no dialog de edição (linhas 407-439). O backend **já aceita** `avatar` no create (`users.ts:17`, `users.ts:133`), então é só falta de UI.
2. **Não reporta requisitos não atendidos** — `create()` (linha 153) faz `if (!name || !email || !password) return;` e silencia erros (`catch {}`). O botão fica desabilitado sem explicação; erros do backend (400/409) são engolidos.
3. **Form "use client"** — a página já tem `"use client"` (linha 1), mas o form é empilhado de `useState` soltos dentro da página gigante. O usuário quer um form estruturado com `@tanstack/react-form` (padrão do exemplo BugReportForm) + componentes `Field`/`FieldError`.

**Regras de validação do backend (`routes/users.ts`):** name ≥ 1, email válido, password ≥ 6, role enum; duplicado → `409 "Email already registered"`; inválido → `400 "Invalid input"`.

**Pré-requisitos inexistentes no frontend:**
- `@tanstack/react-form`, `@tanstack/react-query`, `zustand` **não instalados**.
- `@/components/ui/field` e `@/components/ui/input-group` (usados no exemplo) **não existem** (glob: só spinner/tooltip/card/button/etc.).
- Nenhum `QueryClientProvider` (layout.tsx não tem provider de queries).
- Padrão atual: cada página usa `useState` + `api()` em `useEffect` (27 chamadas de `api(` em 16 arquivos). `use-user.ts` é um hook useState+localStorage.

---

## 2. Decisões (Socratic Gate)

| Dúvida | Decisão |
|--------|---------|
| Escopo da migração | **App inteiro**: Todas as páginas migram para TanStack Query + Zustand |
| Primitivos de UI do form | **Criar** `field.tsx` + `input-group.tsx` (padrão shadcn do repo) |
| Avatar no create | **Seleção da pasta, sem upload** (mesmo seletor do editar) |

---

## 3. Visão da arquitetura-alvo

- **Server-state (TanStack Query):** todos os dados vindos do backend ficam no cache do Query. Keys em formato de domínio, funções de query co-locadas por domínio, mutações com invalidação cirúrgica e otimismo onde compensar. Estados obrigatórios: loading, error, empty, refetch em background, stale-data.
- **Client-state (Zustand):** só estado de UI que é compartilhado entre componentes/sessão de autenticação. **Dados do servidor NÃO entram em Zustand**. Substituir `use-user.ts` por store `useAuthStore` hidratada do localStorage.
- **Auth:** token continua no localStorage (`grafica_token`). Sessão do usuário vira Zustand (`grafica_user`), sincronizada com eventos `grafica:user`/`storage`.
- **Form:** `@tanstack/react-form` + schema zod espelhando o backend.

### Estrutura de arquivos nova

```
src/
├─ components/query-provider.tsx          # wrapper client com QueryClientProvider
├─ components/ui/field.tsx                # Field, FieldLabel, FieldDescription, FieldError, FieldGroup
├─ components/ui/input-group.tsx          # InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea
├─ components/user-dialog.tsx             # dialog create/edit com @tanstack/react-form (use client)
├─ components/avatar-picker.tsx           # grade de fotos + "Sem foto" (usado no create e no edit)
├─ hooks/use-auth-store.ts                # Zustand: { user, setUser, clear } hidratado do localStorage
├─ lib/queries/query-keys.ts              # helpers de query keys por domínio
├─ lib/queries/query-client.ts            # instância + defaults (staleTime, retry, refetchOnWindowFocus)
├─ lib/queries/users.ts                   # useUsersQuery, useUserPhotosQuery, useCreateUser, useUpdateUser
├─ lib/queries/stock.ts                   # stockItems (list/detail/category), transactions, mutations
├─ lib/queries/machines.ts
├─ lib/queries/suppliers.ts
├─ lib/queries/messages.ts
├─ lib/queries/whatsapp.ts                # status (refetchInterval 4000), config, logout, reconnect, test
├─ lib/queries/auth.ts                    # useLogin (mutation; grava localStorage + store)
├─ stores/session.ts                      # (opcional) se houver UI compartilhada do chat/whatsapp
```

---

## 4. Abas de Tarefas por Fase

### Fase 1 — Infraestrutura de estado (frontend-specialist)
- `npm i @tanstack/react-query @tanstack/react-form zustand` em `grafica-app/`.
- Criar `components/query-provider.tsx` (client) e envolvê-lo no `app/layout.tsx` (dentro de `AppGate`).
- Criar `lib/queries/query-client.ts` ($QueryClient` com defaults: `staleTime` ~30s, `retry: 1`, refetch em background ao focar janela).
- Criar `lib/queries/query-keys.ts` com factories por domínio:
  - `users: { all(), lists(), list(), photos() }`
  - `stock: { all(), lists(), list(), detail(id), category(cat), transactions() }`
  - `machines: { all(), lists(), list(), detail(id) }`
  - `suppliers`, `messages`, `whatsapp`, `auth`
- Criar `hooks/use-auth-store.ts` (Zustand) substituindo `use-user.ts`; sincronizar com `getUser()`/`setUser()`/`clearUser()` e eventos.
- **Verificação:** `npm run lint` + `npx tsc --noEmit` OK; app abre sem quebrar.

### Fase 2 — Primitivos de UI do form (frontend-specialist)
- Criar `components/ui/field.tsx` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`) seguindo o estilo shadcn do repo (`cn`, class-variance, `data-invalid`).
- Criar `components/ui/input-group.tsx` (`InputGroup`, `InputGroupAddon`, `InputGroupText`, `InputGroupTextarea`) para o contador do textarea caso necessário.
- **Verificação:** lint + tsc; renderização de exemplo com `data-invalid` vermelho.

### Fase 3 — Query layer + migração dos domínios (frontend-specialist)
- `users.ts`, `stock.ts`, `machines.ts`, `suppliers.ts`, `messages.ts`, `whatsapp.ts`, `auth.ts`:
  - Query fns co-locadas (usam `api()` existente).
  - Hooks `use*Query`/`use*Mutation` com `onSuccess` → invalidação cirúrgica (ex.: transação → invalidates `stock.all()` + dashboard; update usuário → `users.lists()` e atualiza auth store se self; enviar msg → `messages.lists()`).
  - Otimismo onde compensa: supplier delete/create, stock transaction (com rollback em erro).
- **Verificação:** cada dominio com um page rodando os estados loading/error/empty/refetch.

### Fase 4 — Migração das páginas (frontend-specialist)
Migrando **uma a uma** (build + lint após cada):
1. `(dashboard)/page.tsx` (dashboard) — 2 queries + skeleton loading + empty state.
2. `(dashboard)/produtos/page.tsx` + `produtos/new/page.tsx` (+ `components/edit-stock-item-dialog.tsx`, `components/machine-select-for-item.tsx`).
3. `(dashboard)/estoque/page.tsx` (transações com otimismo).
4. `(dashboard)/tintas/page.tsx`.
5. `(dashboard)/maquinas/page.tsx`.
6. `(dashboard)/fornecedores/page.tsx` (delete otimista com undo via toast).
7. `(dashboard)/relatorios/page.tsx`.
8. `(dashboard)/chat/page.tsx` — query inicial + **otimista** ao enviar + refetch silencioso; manter socket socket.io só para mensagens em tempo real (não duplicar estado).
9. `components/whatsapp-panel.tsx` — `useWhatsappStatusQuery` com `refetchInterval: 4000`, mutações config/logout/reconnect/test.
10. `app/(dashboard)/config/page.tsx` — **Fase 5 dedicada** (avatar + form).

Para cada página com fetch: trocar `useState`+`useEffect` por `useQuery`; manter `search`/filtros locais como estado de UI **do componente** (não Zustand). Erros do backend via `throwOnError`/`onError` → toast. **Estados vazios** em todas as listas.

### Fase 5 — Bug do avatar + form de usuário (frontend-specialist) ⭐
1. **`components/avatar-picker.tsx`**: extrair a grade de fotos do edit (com "Sem foto") usando `useUserPhotosQuery`; `value`/`onChange`.
2. **Reconstruir dialogs** em `components/user-dialog.tsx` (mode `create`/`edit`) usados pela config page:
   - `@tanstack/react-form` + schema zod (espelho do backend): name ≥1, email regex, password ≥6 (create e edit quando preenchida), avatar opcional.
   - `<Field>`/`<FieldLabel>`/`<FieldError>` – erros inline após `isTouched && !isValid` (padrão do exemplo BugReportForm).
   - Create inclui o **AvatarPicker** (bug real).
   - Erros da API: `onSubmit` → em caso de `ApiError` (409 duplicado, 400 inválido) mostra **toast** + mensagem inline.
   - Substituir `busy`/disables por `submissionStatus` do TanStack Form.
3. **Config page**: usar `useUsersQuery`, `useCreateUser`, `useUpdateUser`; estados loading/error/empty na tabela; invalidação `users.lists()` após escrever; atualizar auth store quando editar o próprio usuário. Manter WhatsAppPanel/backend/network podendo ficar como está OU migrados (escopo da Fase 4).
4. `auth/page.tsx`: `useLoginMutation` (grava localStorage + auth store) — manter token no localStorage.

### Fase 6 — Verificação final
- `npm run lint` e `npx tsc --noEmit` em `grafica-app/`.
- Testes backend seguem intactos (backend inalterado).
- Checklist manual abaixo.

---

## 5. Critérios de Sucesso (Verificação)

- [ ] Create user: **avatar selecionável** da pasta `/users` (grade + "Sem foto").
- [ ] Create user: erros inline visíveis (nome vazio, email inválido, senha <6) **antes** de dar submit; erro do backend (email duplicado) = toast + mensagem.
- [ ] Edit user continua funcionando (avatar, role, senha opcional) com o novo form.
- [ ] Todas as páginas migradas usam TanStack Query; loading/error/empty/refetch-em-background/stale visíveis.
- [ ] Mutações invalidam queries cirúrgicas; transações/delete de fornecedor com otimismo e rollback.
- [ ] `use-user.ts` substituído por `useAuthStore` (Zustand); nada de dados do servidor no store.
- [ ] Chat: envio otimista + sem duplicar estado com socket.io.
- [ ] WhatsApp panel: polling 4s via `refetchInterval`, logout ainda gera QR novo (regressão coberta).
- [ ] `npm run lint` + `tsc --noEmit` limpos; `next build` exit 0.
- [ ] Bug antigo regressivo: criar usuário → salvar → ir para "Editar" → avatar persiste.

---

## 6. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|:----------:|-----------|
| Migração grande (16 arquivos) quebrar build | Alta | Fases 4 migram 1 página por vez com build/lint após cada |
| Duplicar estado (socket chat + query) | Alta | Query só p/ inicial + otimista; socket p/ updates em tempo real; invalidação silenciosa |
| Afetar sessão/auth (Zustand vs localStorage) | Alta | Manter `grafica_token`/`grafica_user` como fonte; store apenas espelha com eventos |
| `@tanstack/react-form` v1 API desconhecida | Média | Usar padrão do exemplo do usuário (validators on submits + field.state.meta) e ler docs do pacote |
| SSR/hydration (Next 16 static export) | Média | Providers/Stores só em client components; Zustand sem propaga SSR |
| Sem testes frontend no repo | Média | Verificação via lint + tsc + next build + checklist manual (referência: skills testing) |

---

## 7. Fora de Escopo (posteridades)

- Upload de avatar (novo arquivo) — requer endpoint de upload no backend.
- Migração do backend para Better Auth (`docs/PLAN-better-auth.md`).
- Testes automatizados de UI (sugerir `playwright` num plano futuro se o time quiser).