# PLAN: Ações por tecla ESC (menu Sair / Fechar o app) — Electron

## Goal
Adicionar, **apenas no shell Electron (desktop fullscreen)**, uma sequência de ações acionadas pela tecla **ESC**: abrir um menu/diálogo "O que deseja fazer?" com **Sair** (logout), **Fechar o app** e **Cancelar** — cada ação destrutiva precedida de um **diálogo de confirmação** separado. No navegador (web) o recurso é desativado por completo (gate por presença de `window.grafica`).

> **Decisões do Socratic Gate (confirmadas pelo usuário):**
> 1. **ESC abre um MENU/DIÁLOGO** com opções: "Sair", "Fechar o app", "Cancelar".
> 2. **Escopo = Electron desktop ONLY** (implementação via preload `window.grafica`); web inalterada.
> 3. **Confirmação = SIM** — um diálogo de confirmação antes de "Sair" e antes de "Fechar o app" (diálogos separados por ação).
> 4. **Prioridade ESC**: com um modal/diálogo já aberto, **ESC fecha o modal primeiro**; o menu global de ESC só dispara quando **nenhum overlay está aberto**.

---

## Objective
1. No **Electron main** (`electron/main.js`), expor um IPC `grafica:quit` que fecha a `BrowserWindow` principal (`close()`), disparando `window-all-closed`/`before-quit` → **mata o backend** (já implementado em `before-quit`).
2. No **preload** (`electron/preload.js`), expor `window.grafica.quit()`.
3. No **renderer (Next.js)**, criar um componente client global montado em `(dashboard)/layout.tsx` que:
   - Escuta `keydown` global para `Escape`;
   - Ignora a ação global quando **qualquer overlay** estiver aberto (modal-first priority);
   - Só atua em Electron (`window.grafica?.quit` existe);
   - Primeiro ESC → menu com 3 ações; segundo ESC no menu = "Cancelar" (fecha); com o menu aberto ele **é** o overlay, então o próximo ESC fecha;
   - "Sair" → diálogo de confirmação → confirma → `clearUser()` + `clearSession()` + `router.replace('/auth')`;
   - "Fechar o app" → diálogo de confirmação → confirma → `window.grafica.quit()`.

---

## Project Type
**WEB (Next.js App Router estático) + ELECTRON SHELL (não-mobile).**
- Agente principal da UI: `frontend-specialist`.
- Agente do shell Electron: `devops-engineer` (IPC main/preload).

---

## Scope (In)
- Novo IPC `grafica:quit` no `main.js` + `quit()` no `preload.js`.
- Novo componente client `escape-actions-menu.tsx` montado em `(dashboard)/layout.tsx`.
- Diálogos: menu ESC + confirmação de Sair + confirmação de Fechar (reuso do `@base-ui/react/dialog` wrapper `src/components/ui/dialog.tsx`).
- Integração de logout limpo (`clearUser()` + `clearSession()` + redirect `/auth`) que funcione junto ao hook `useUser` já existente.

## Non-Goals (Fora)
- NÃO alterar `electron-builder.yml`, empacotamento, spawn de backend, nem a lógica de `before-quit`.
- NÃO adicionar botão/UI de "Sair" visível no `sub-sidebar` (fora de escopo — o ESC é o gatilho; nenhuma nova entrada de menu permanente).
- NÃO mudar o comportamento de ESC em navegador web (recurso desativado por completo).
- NÃO customizar o `Dialog` raiz (`dialog.tsx`) nem os callers existentes (p. ex. `edit-stock-item-dialog`).
- NÃO adicionar sistema global de tema, hooks novos de estado além do componente.

---

## Tech Stack (com rationale)
| Tech | Uso | Rationale |
|------|-----|-----------|
| `@base-ui/react/dialog` (wrapper `src/components/ui/dialog.tsx`) | Menus e confirmações ESC | Já usado em todo o app; modal-first dado; `DialogContent` tem `data-slot="dialog-content"` (base para detecção de overlay). |
| `@remixicon/react` | Ícones das ações do menu | já instalado no projeto. |
| `next/navigation` (`useRouter`) | Redirect para `/auth` no logout | padrão usado em todas as páginas do dashboard. |
| `src/lib/api.ts` (`clearUser`, `clearSession`, `getToken`) | Limpeza de sessão | helpers nativos, já existentes. |
| `window.grafica.quit()` (preload `ipcRenderer.invoke`) | Fechar app via renderer | bridge segura com `contextIsolation` + `sandbox` já ativos. |

---

## Mecanismo de "modal-first" (decisão de design)
**Recomendação: detecção por DOM via `document.querySelector('[data-slot="dialog-content"]')`** (e opcionalmente `[data-slot="dropdown-menu-content"]` para menus verticais).

- **Justificativa:** o wrapper `dialog.tsx` já fixa `data-slot="dialog-content"` em `DialogContent` (popup). Qualquer diálogo do app (incluindo `edit-stock-item-dialog`) usa esse wrapper → a query cobre **todos** sem tocar em nenhum caller. Zero mudança no `dialog.tsx`.
- **Trade-off (vs. evento `grafica:overlay-open`):** o evento seria mais "determinístico" (estado explícito) mas exige editar `dialog.tsx` e adicionar `open`-handlers em todos os callers — mais superfície de mudança e risco de regressão. A query DOM é leve, pontual e retroativamente cobre diálogos existentes.
- **Caveat da query:** usa a presença do nó no DOM. Como `Base UI Dialog` **desmonta** o popup ao fechar (`data-closed` + unmount), a presença do nó é um proxy confiável de "overlay aberto". Adicionar checagem de `data-open` (dados presentes durante animação) torna a detecção robusta mesmo durante transição.
- **Menus verticais (`dropdown-menu`)**: têm `data-slot="dropdown-menu-content"` (diferente). **Decisão:** o ESC global também deve respeitá-los (adicionar à query) para evitar que ESC feche um menu suspenso **e** abra o menu global no mesmo clique. Custo desprezível; comportamento coerente. Logo a query compõe: `[data-slot="dialog-content"], [data-slot="dropdown-menu-content"]`.
- **Listener no `window` em fase `capture`**: garante que o handler global veja o ESC antes/de forma independente de `stopPropagation` de componentes Base UI, permitindo decidir "bail" corretamente. Se um overlay detectado estiver aberto → **retorna sem abrir o menu global** (deixa o próprio overlay/Base UI fechar).

> **Nota sobre ESC dentro de inputs:** o usuário aprovou que ESC continua agindo mesmo com foco em `input`/`textarea` (app kiosk fullscreen). O menu global NÃO será suprimido por focus em campo de edição. Registrar como comportamento intencional (ver Riscos/Edge cases).

---

## File Structure (alterações)
```
electron/
  main.js            [MOD]  + ipcMain.handle('grafica:quit', ...)
  preload.js         [MOD]  + quit: () => ipcRenderer.invoke('grafica:quit')

grafica-app/src/
  components/
    escape-actions-menu.tsx   [NEW]  componente client global (menus ESC + confirmações + logout/quit)
  app/
    (dashboard)/
      layout.tsx              [MOD]  montar <EscapeActionsMenu /> ao lado do <NotificationsProvider />
```

---

## Task Breakdown

### T1 — IPC `grafica:quit` no main + `quit()` no preload
- **Agent:** `devops-engineer`
- **INPUT:** `electron/main.js`, `electron/preload.js` atuais (IPC `grafica:info`, `grafica:net`) já existentes.
- **OUTPUT:**
  - Em `main.js` adicionar (junto aos demais `ipcMain.handle`):
    ```js
    ipcMain.handle('grafica:quit', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.close();
    });
    ```
    - `win.close()` dispara `window-all-closed` → `app.quit()` (fora de darwin) → `before-quit` já mata o backend (`backendProcess.kill('SIGTERM')`).
  - Em `preload.js` adicionar ao objeto exposto:
    ```js
    quit: () => ipcRenderer.invoke('grafica:quit'),
    ```
- **VERIFY:**
  - `electron/preload.js` expõe `window.grafica.quit` como função (inspecionar `typeof window.grafica.quit === 'function'` no devtools do app).
  - Chamar `window.grafica.quit()` no devtools fecha a janela **e** o log `[graficaos] encerrando backend` aparece (backend morto), em modo `server`.
  - Sem `unhandled` no console do main.

### T2 — Componente client `escape-actions-menu.tsx`
- **Agent:** `frontend-specialist`
- **INPUT:** `src/components/ui/dialog.tsx` (wrapper), `src/lib/api.ts` (`clearUser`, `clearSession`, `getUser`, `getToken`), hook `useUser` resets via `grafica:user`, `@remixicon/react` icons.
- **OUTPUT:** `src/components/escape-actions-menu.tsx` (`"use client"`), com:
  1. **Gate Electron**: `const isElectron = typeof window !== 'undefined' && typeof (window as any).grafica?.quit === 'function'`. Se `false` → o componente renderiza `null` e não registra listener (nada no web).
  2. **Listener `keydown`** no `window` (capture) para `Escape`:
     - Se `!isElectron` → bail.
     - **Modal-first**: se `document.querySelector('[data-slot="dialog-content"], [data-slot="dropdown-menu-content"]')` existir → **bail** (não abre o menu global; o overlay/Base UI trata o ESC e fecha).
     - Se o próprio menu ESC estiver aberto → ESC **fecha o menu** (equivale a "Cancelar").
     - Senão → **abre o menu**.
  3. **Estados internos**: `menuOpen`, `confirmAction: 'logout' | 'quit' | null` (estado do diálogo de confirmação). Usar `Dialog`/`DialogContent` com `open` controlado + `onOpenChange`.
  4. **Menu principal** (primeiro ESC): título "O que deseja fazer?", 3 ações:
     - **Sair** → abre confirmação de logout.
     - **Fechar o app** → abre confirmação de quit.
     - **Cancelar** → fecha o menu (mesmo efeito do segundo ESC).
  5. **Confirmação Sair**: texto ("Tem certeza que deseja sair?") + botões [Cancelar]/[Confirmar]. Ao confirmar: `clearUser()` (dispara `grafica:user` → `useUser` reseta) **e** `clearSession()` (garante remoção dos dois itens) e `router.replace('/auth')`.
  6. **Confirmação Fechar**: texto ("Tem certeza que deseja fechar o app?") + [Cancelar]/[Confirmar]. Ao confirmar: `await window.grafica.quit()`.
- **VERIFY:**
  - Em Electron (modo dev via `npm run package:electron`/`electron .` ou `npm run dev` no shell): primeiro ESC abre o menu; segundo ESC fecha; enquanto o menu está aberto, ESC não reabre.
  - Em navegador (web `npm run dev`): ESC não faz nada; `window.grafica` ausente.
  - Com um diálogo existente aberto (ex.: modal qualquer do app), ESC **fecha o diálogo** e **não** abre o menu global.
  - Fluxo Sair: menu → Sair → confirmação → confirma → redireciona para `/auth`, user bar some (useUser resetou), token removido do `localStorage`.
  - Fluxo Fechar: menu → Fechar → confirmação → confirma → janela fecha e backend é morto (modo server).

### T3 — Montar `EscapeActionsMenu` no layout do dashboard
- **Agent:** `frontend-specialist`
- **INPUT:** `src/app/(dashboard)/layout.tsx` (já monta `<NotificationsProvider />`).
- **OUTPUT:** adicionar `<EscapeActionsMenu />` ao layout como componente **client** irmão do `<NotificationsProvider />` (dentro do mesmo `<>` raiz). Como o componente renderiza `null` no web e só registra o listener em Electron, o impacto é zero nas rotas web.
- **VERIFY:**
  - O componente aparece em todas as rotas `(dashboard)/` (layout compartilha).
  - Fora do grupo `(dashboard)` (ex.: `/auth`) o componente **não** está montado (conforme esperado — ESC não age na tela de login).
  - `npm run lint` + `npx tsc --noEmit` em `grafica-app/` → 0 erros.
  - `npm run build` (export) → `out/` gerado sem erro.

### T4 — Verificação final (Phase X)
- **Agent:** `frontend-specialist` + `devops-engineer`
- **INPUT:** código completo (T1–T3) + app rodando em Electron e em web.
- **OUTPUT:** checklist de QA manual (abaixo) executado e aprovado.
- **VERIFY:** todos os itens da **Verification Checklist** passam; sem regressão nos diálogos existentes (ex.: `edit-stock-item-dialog`).

---

## Risks / Edge Cases
- **Base UI Dialog e `stopPropagation` do ESC:** o próprio `Dialog` intercepta ESC para fechar. O listener global usa fase **capture** + query DOM para decidir "bail" determinístico, evitando dupla ação (fechar modal **e** abrir menu no mesmo ESC). Verificar em QA.
- **`clearSession()` não dispara `grafica:user`:** `clearSession` remove token+user mas **não** emite o evento; o hook `useUser` só reseta com o evento `grafica:user` (ou `storage`). Por isso o logout deve chamar **`clearUser()`** (que emite) **e** `clearSession()` (redundância segura). Registrar no código T2.
- **ESC com foco em `input`/`textarea`:** comportamento intencional (kiosk fullscreen) — ESC abre o menu mesmo com foco em campo de edição. Não suprimir (decisão do usuário). Documentar.
- **Modo `client` (PC 2/3) sem backend local:** `window.grafica.quit()` fecha a janela normalmente; `before-quit` só mata o backend se `backendProcess` existir (modo `server`). Sem erro no modo `client`.
- **Multiple `BrowserWindow`:** `BrowserWindow.getAllWindows()[0]` é seguro (app é single-window); usar o primeiro.
- **Nó do popup durante animação de fechamento:** query pode detectar nó ainda no DOM na transição `data-closed`. A checagem de `data-open`/estado interno do componente (`menuOpen`) mitiga abrir o menu global enquanto um diálogo fecha.
- **Menus verticais (`dropdown-menu-content`):** incluídos na query para que ESC no menu suspenso não dispare também o menu global. Sem esse cuidado o usuário "perderia" o primeiro ESC.
- **Regressão em diálogos existentes:** reuso do wrapper `Dialog`; nenhuma alteração em `dialog.tsx` → risco baixo. Conferir `edit-stock-item-dialog` em QA.

---

## Agent Assignments (resumo)
| Task | Agent |
|------|-------|
| T1 — IPC `grafica:quit` + preload `quit()` | `devops-engineer` |
| T2 — Componente `escape-actions-menu.tsx` (menu + confirmações + logout/quit + modal-first) | `frontend-specialist` |
| T3 — Montagem no `(dashboard)/layout.tsx` | `frontend-specialist` |
| T4 — Verificação final (Phase X) | `frontend-specialist` + `devops-engineer` |

---

## Verification Checklist (QA manual Phase X)
- [ ] **Gate Electron:** em navegador web (`npm run dev`), apertar ESC em qualquer rota do dashboard → nada acontece; `window.grafica` não existe.
- [ ] **Gate Electron:** em Electron (app empacotado/dev shell), primeiro ESC abre o menu "O que deseja fazer?" de forma fullscreen.
- [ ] **Modal-first priority:** abrir um diálogo existente (ex.: editar item de estoque / `edit-stock-item-dialog`), apertar ESC → **fecha somente o diálogo** e **não** abre o menu global. Repetir verifica que o próximo ESC abre o menu.
- [ ] **Menu funcionando:** primeiro ESC abre o menu; segundo ESC (com o menu aberto) fecha = "Cancelar"; terceiro ESC vira o "primeiro" e reabre. Fluxo cíclico correto.
- [ ] **Ação Cancelar:** abrir menu → clicar "Cancelar" → menu fecha sem ação.
- [ ] **Logout Sair (com confirmação):** menu → "Sair" → diálogo de confirmação aparece (NÃO sai direto) → Cancelar não faz nada; repetir e confirmar → **redireciona para `/auth`**, a barra de usuário no `sub-sidebar` some (useUser resetou), `localStorage.grafica_token`/`grafica_user` removidos.
- [ ] **Fechar o app (com confirmação):** menu → "Fechar o app" → diálogo de confirmação → confirmar → a janela Electron fecha; em modo `server` o log `[graficaos] encerrando backend` aparece (backend morto na porta 3001).
- [ ] **Sem regressão:** `edit-stock-item-dialog` e demais diálogos continuam abrindo/fechando normalmente; ESC continua fechando modais como antes.
- [ ] **Build:** `npm run lint` + `npx tsc --noEmit` em `grafica-app/` → 0 erros; `npm run build` (export) → `out/` ok.
- [ ] **Lint shell:** `electron/main.js` + `preload.js` sem erro de sintaxe (node `--check`).

---

## Done When
- [ ] `window.grafica.quit()` fecha a janela e mata o backend (modo server).
- [ ] ESC abre o menu global apenas em Electron; web inalterada (gate ativo).
- [ ] Modal-first respeitado: ESC fecha overlays existentes antes de acionar o menu global.
- [ ] Logout limpo via menu funciona (clearUser + clearSession + redirect `/auth` + useUser resetado).
- [ ] Fechar o app com confirmação funciona.
- [ ] Diálogos existentes sem regressão; lint/build limpos.
- [ ] Checklist de verificação (Phase X) 100% ✔.

---

## Notas
- Reuso do wrapper `@base-ui/react/dialog` via `src/components/ui/dialog.tsx` — **não** editar o wrapper nem os callers.
- `data-slot` alvos: `dialog-content` (diálogos) e `dropdown-menu-content` (menus verticais) para a detecção de overlay.
- O menu global só é montado dentro de `(dashboard)/layout.tsx`; na tela `/auth` não há ação de ESC (esperado).
