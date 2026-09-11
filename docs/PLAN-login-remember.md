# Plan: Login - Menu ESC de sair + Lembrar credenciais

## Contexto

O projeto usa **Next.js (static export)** + **Electron** + **shadcn/base-ui**.

- Página de login: `grafica-app/src/app/auth/page.tsx`
- Componente de ações por tecla **ESC**: `grafica-app/src/components/escape-actions-menu.tsx`
  - Hoje montado apenas no layout do dashboard: `src/app/(dashboard)/layout.tsx:29`
  - Listener de `Escape` → abre `Dialog` com menu (Sair / Fechar o app) — mas **só ativo se `isElectron`** (`window.grafica?.quit` existe)
  - `handleQuit()` chama `window.grafica.quit()` (IPC → `main.js` encerra o backend via `before-quit`)
- Padrão de componentes UI: `src/components/ui/*` usando `@base-ui/react`
- `@base-ui/react/checkbox` já está disponível em node_modules (confirmado)
- Persistência via `window.localStorage` (ver `src/lib/api.ts`)

**Problemas encontrados:**
1. O menu ESC **não aparece na página de login** — o `EscapeActionsMenu` só é montado no layout `(dashboard)`. E na página de login não deveria haver opção "Sair" (logout), só "Fechar o app".
2. Não existe checkbox component (`src/components/ui/checkbox.tsx`) nem lógica de "lembrar credenciais".

---

## Decisões (Socratic Gate)

- **Menu ESC no login**: reutilizar `EscapeActionsMenu` com **variante restrita** que mostra **apenas** a ação "Fechar o app" (finaliza backend). Sem opção "Sair/logout" (na tela de login não há sessão).
- **Remember me**: salvar **e-mail + senha** em `localStorage` (escolha do usuário, prioriza conveniência). Preenchimento automático ao abrir a tela de login.

---

## Tarefas

### 1. Criar componente `checkbox.tsx` (shadcn/base-ui)

Arquivo: `grafica-app/src/components/ui/checkbox.tsx`

- Usar `@base-ui/react/checkbox` (padrão do projeto, como visto em `dropdown-menu.tsx` → `MenuPrimitive.CheckboxItem`).
- Seguir o estilo dos demais `ui/*` (cva + cn de `@/lib/utils`).
- Exportar `Checkbox` com props `checked` / `onCheckedChange` (estado controlado) e `defaultChecked` (não controlado).

### 2. Adicionar variante restrita ao `EscapeActionsMenu`

Arquivo: `grafica-app/src/components/escape-actions-menu.tsx`

- Aceitar uma prop, ex. `mode?: "full" | "quit-only"` (default `"full"`).
- Em `"quit-only"`:
  - Não mostrar a opção "Sair" (logout) no menu.
  - Mostrar apenas "Fechar o app" (e "Cancelar").
- Manter o `isElectron` guard (funciona na página de login porque `window.grafica.quit` existe lá também — o preload expõe `grafica` em toda a app Electron).

### 3. Montar `EscapeActionsMenu` na tela de login

Arquivo: `grafica-app/src/app/auth/page.tsx`

- Importar e renderizar `<EscapeActionsMenu mode="quit-only" />` dentro da página de login (dento do `div` raiz).
- A página já é `'use client'`, compatível com o componente.

### 4. Lógica "Lembrar credenciais" no login

Arquivo: `grafica-app/src/app/auth/page.tsx`

- Novas chaves de localStorage: `grafica_remember_email`, `grafica_remember_password`.
- Estado `remember` (boolean), controlado pelo `Checkbox`:
  ```tsx
  <Checkbox checked={remember} onCheckedChange={setRemember} />
  ```
- **No mount** (via `useEffect`): se houver credenciais salvas, preencher `email`/`password` e marcar o checkbox.
- **No submit** (`handleSubmit`): se `remember` estiver marcado → salvar email+senha; se desmarcado → remover as chaves.
- **UI**: adicionar o `Checkbox` com label "Lembrar de mim" no formulário (entre senha e o botão Acessar).

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `grafica-app/src/components/ui/checkbox.tsx` | **Novo** — componente Checkbox (base-ui) |
| `grafica-app/src/components/escape-actions-menu.tsx` | Adicionar prop `mode`/variante restrita de sair |
| `grafica-app/src/app/auth/page.tsx` | Montar menu ESC + checkbox + lógica remember me |

---

## Verificação

1. `npm run lint` no backend/frontend passa (regra de pages do Next no backend é warning pré-existente, ignorar).
2. `npm run typecheck` no backend e build do frontend passam (o `next build` valida TS/JSX).
3. Teste manual com `npm run app`:
   - Na tela de login, `ESC` abre o dialog com **apenas** "Fechar o app" + "Cancelar" (sem "Sair").
   - Fechar o app encerra o backend (processo na 3001 morre).
   - Marcar "Lembrar de mim" e fazer login → recarregar / reabrir: campos já preenchidos, checkbox marcado.
   - Desmarcar "Lembrar de mim" e logar → credenciais removidas (campos vazios ao reabrir).

---

## Notas de segurança

- Credenciais ficam em `localStorage` em texto claro, acessíveis via DevTools para quem usar o PC. Aceito conforme escolha do usuário (uso interno da gráfica, prioriza conveniência).
- O menu ESC só aparece em ambiente Electron (`isElectron`), preservando o comportamento em navegador.
