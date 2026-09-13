# PLAN: Migração working tree para `versao-estavel` + nova branch `versao-estavel-2.0`

## Objetivo
Substituir a working tree do repositório local (branch `main`, HEAD `fdd6273`) pelo tree completo da branch remota `origin/versao-estavel` (HEAD `39691a9` = main + 1 commit), criando uma nova branch local `versao-estavel-2.0` **sem avançar nem modificar `main`**. O repo deve terminar na branch `versao-estavel-2.0` com working tree idêntica ao `versao-estavel`, todas as dependências instaladas e a suíte de verificação verde (lint, build frontend/backend, vitest, e2e/playwright). As alterações locais não commitadas serão **descartadas** (com backup via stash para recuperação).

## Estado atual (confirmado)
- `main` local = `fdd6273`; `origin/versao-estavel` = main + 1 commit `39691a9`. merge-base = `fdd6273` (main é ancestrado por versao-estavel). Diff: 461 arquivos / +83042 / -1451.
- 6 arquivos modificados locais: `electron/electron-builder.client.yml`, `electron/electron-builder.server.yml`, `electron/electron-builder.yml`, `electron/main.js`, `grafica-app/src/app/layout.tsx`, `grafica-app/src/lib/api.ts`.
- 2 untracked: `grafica-app/cmp2.mjs`, `grafica-app/src/components/session-boot.tsx`.
- `dist/` e `node_modules/` são gitignored e NÃO podem ser apagados.
- Windows + PowerShell 5.1.
- Raiz tem scripts: dev:ui, dev:backend, dev:web, app, app:preview, build:export, build:backend, db:push, db:seed, lint, e2e:build, e2e, e2e:install, package:electron, package:server, package:client.

## Task Breakdown

- [ ] **T1. Backup das alterações locais (stash com `-u`)**
  - Input: 6 modificados + 2 untracked em `main@fdd6273`.
  - Output: snapshot recuperável (`stash@{0}`) de todo o estado local.
  - Comando: `git stash push -u -m "backup locais fdd6273 (a descartar em versao-estavel-2.0)"`.
  - Verify: `git status --short` vazio; `git stash list` mostra a entrada.

- [ ] **T2. Fetch + verificação de integridade do tree remoto**
  - Input: `origin/versao-estavel`.
  - Output: remoto atualizado e integridade confirmada.
  - Comando: `git fetch origin`; depois `git rev-parse origin/versao-estavel`, `git log --oneline -2 origin/versao-estavel`, `git merge-base main origin/versao-estavel` (deve ser `fdd6273`), `git ls-tree origin/versao-estavel` (confere estrutura: `electron/`, `electron/staging/backend/`, `grafica-app/backend/`, `e2e/`, `docs/` etc.).
  - Verify: `origin/versao-estavel` == `39691a9...`; merge-base == `fdd6273...`.

- [ ] **T3. Criação da branch `versao-estavel-2.0` a partir de `origin/versao-estavel`**
  - Input: tree completo de `origin/versao-estavel`.
  - Output: nova branch local apontando para `39691a9` com working tree no tree versao-estavel.
  - Comando: `git checkout -b versao-estavel-2.0 origin/versao-estavel`.
  - Verify: `git branch --show-current` == `versao-estavel-2.0`; `git log --oneline -1` == `39691a9`; working tree contém `electron/staging/backend/package.json`; `git status --short` limpo (exceto ignorados).

- [ ] **T4. Descarte de alterações locais remanescentes**
  - Input: working tree pós-checkout.
  - Output: working tree 100% idêntica ao commit `39691a9`.
  - Comando: se sobrar untracked bloqueando (ex.: diferença de case no Windows), `git clean -fd` — **NUNCA `-x`**, para preservar `node_modules/` e `dist/`. Em caso de "untracked would be overwritten", remover/limpar o arquivo e repetir o checkout.
  - Verify: `git status --short` vazio; `git diff HEAD` vazio.

- [ ] **T5. `npm install` em todos os subpackages**
  - Input: tree novo com package.json próprios.
  - Output: dependências instaladas em 5 locais: raiz, `grafica-app/`, `grafica-app/backend/`, `electron/`, `electron/staging/backend/`.
  - Comando (sequencial; cada um exit 0): `npm install` na raiz → `grafica-app` → `grafica-app/backend` → `electron` → `electron/staging/backend`.
  - Verify: `npm install` exit 0 em cada package; `npm ls` sem erros fatais em cada.

- [ ] **T6. Verificação de saúde do git**
  - Input: repo pós-install.
  - Output: garantia de estado íntegro antes de build/teste.
  - Comandos: `git status`, `git branch -v`, `git log --oneline -3`, `git status --short --ignored` (somente `dist/` e `node_modules/` ignorados).
  - Verify: branch ativa `versao-estavel-2.0`; HEAD `39691a9` no topo; `main` permanece `fdd6273`; status limpo (exceto ignorados).

- [ ] **T7. Lint**
  - Input: código do tree versao-estavel + deps instaladas.
  - Output: lint sem erros.
  - Comando: `npm run lint` (raiz; rodar também nos subpackages com script lint, se houver).
  - Verify: saída com 0 erros.

- [ ] **T8. Build frontend e backend**
  - Input: tree com deps instaladas.
  - Output: artefatos de build (`build:export` gera `grafica-app/out`; `build:backend` gera o bundle do Fastify).
  - Comando: `npm run build:export; if ($?) { npm run build:backend }`.
  - Verify: ambos exit 0; `grafica-app/out/index.html` existe; bundle do backend gerado.

- [ ] **T9. Testes backend (vitest)**
  - Input: backend do tree versao-estavel.
  - Output: testes unitários/integração passando.
  - Comando: rodar vitest do backend (script `test`/`vitest run` em `grafica-app/backend`); se precisar de DB, garantir `local-replica.db` disponível (ver Risco R5).
  - Verify: vitest sem falhas (não silenciar com `passWithNoTests` sem antes conferir que não há testes definidos).

- [ ] **T10. E2E (Playwright)**
  - Input: build pronto (depende de T8) + playwright no tree.
  - Output: suíte E2E passando.
  - Comando: `npx playwright install chromium` (se preciso); `npm run e2e:build` (se o script e2e exigir build prévio); `npm run e2e`.
  - Verify: todos os specs e2e passam; saída do playwright com sucesso.

- [ ] **T11. Resumo/report final**
  - Input: resultados de T3–T10.
  - Output: report consolidado para o usuário (branch, HEAD, status, resultados de lint/build/testes/e2e).
  - Verify: documenta cada item do checklist de aceite.

## Dependency Graph

```
T1 (stash backup)  ──┐
                     ├─► T3 (checkout -b) ─► T4 (clean) ─► T5 (npm install) ─► T6 (saúde git) ─► T7 (lint) ─┬─► T8 (build) ─► T10 (e2e)
T2 (fetch/integridade)┘                                                                                         └─► T9 (vitest)
                                                                                                                     ▼
                                                                                                              T11 (report)
```

Dependências explícitas (hard blockers):
- **T3** depende de **T1** (working tree limpo) e **T2** (remoto íntegro) — sem stash, o checkout falharia com untracked/overwrite.
- **T4** depende de **T3** (descarte só após checkout).
- **T5** depende de **T4** (install sobre o tree final).
- **T6** depende de **T5** (lockfile/deps refletidos no status antes de validar saúde).
- **T7** depende de **T6** (lint sobre estado íntegro).
- **T8** e **T9** dependem de **T7**; são paralelos entre si (arquivos diferentes: build vs teste backend).
- **T10** depende de **T8** (e2e usa o build; `e2e:build`) e, idealmente, de **T9** (pode rodar em paralelo se necessário — sem conflito de arquivos).
- **T11** depende de todos.

## Agent Assignments

| Task | Agente | Skill auxiliar | Justificativa |
|------|--------|----------------|---------------|
| T1 | devops-engineer | — | operação git de backup/stash |
| T2 | devops-engineer | — | integridade do git remoto |
| T3 | devops-engineer | — | checkout de branch a partir de remoto |
| T4 | devops-engineer | — | limpeza/descarte controlado (nunca `-x`) |
| T5 | devops-engineer | — | install multi-subpackage |
| T6 | devops-engineer | — | verificação de estado do repo |
| T7 | general | lint-and-validate | lint automatizado |
| T8 | frontend-specialist (build:export) + backend-specialist (build:backend) | — | builds por camada |
| T9 | test-engineer | testing-patterns | vitest backend |
| T10 | qa-automation-engineer | webapp-testing / playwright_runner | e2e playwright |
| T11 | general | — | report final consolidado |

> Execução via `/create`: cada tarefa é invocada pelo orquestrador com o agente indicado, respeitando o dependency graph (uma task ativa por vez quando há dependência serial).

## Verification Checklist (aceite final)

- [ ] `git branch --show-current` == `versao-estavel-2.0`; `git log --oneline -1` == `39691a9` no topo.
- [ ] `git status --short` limpo (apenas `dist/` e `node_modules/` como ignorados visíveis em `--ignored`).
- [ ] `main` permanece intacta em `fdd6273` (não foi fast-forward).
- [ ] Working tree contém `electron/staging/backend/package.json` e `grafica-app/backend/` (tree versao-estavel completo).
- [ ] Stash de backup existe (`git stash list` → `stash@{0}`) para recuperação em caso de arrependimento.
- [ ] `npm run lint` com 0 erros.
- [ ] `npm run build:export` exit 0 (frontend ok).
- [ ] `npm run build:backend` exit 0 (backend ok).
- [ ] Vitest backend passa (0 falhas).
- [ ] Playwright E2E passa (`npm run e2e`, chromium instalado).
- [ ] Report final T11 registrado (branch, HEAD, status, cada resultado).

## Riscos e Mitigações

- **R1 — Conflitos de CRLF no Windows:** `core.autocrlf` pode re-normalizar arquivos no checkout e gerar diff ruidoso. Mitigação: não manipular arquivos manualmente; usar apenas `git checkout`; após T4 confirmar `git diff HEAD` vazio (se houver diferença só de EOL, decidir explicitamente normalizar ou ignorar — nunca commitar sem revisão).
- **R2 — Untracked bloqueiam o checkout (`session-boot.tsx`/`cmp2.mjs`):** o checkout de uma branch cujo tree contém esses arquivos falha com "untracked would be overwritten". Mitigação: T1 faz `stash push -u` (cobre untracked) ANTES do checkout; conferir `git status` limpo antes de T3.
- **R3 — `node_modules`/`dist` não podem ser apagados:** `git clean -fd` (sem `-x`) preserva gitignored; **nunca** usar `git clean -fx`/`-fdx`; conferir que `.gitignore` cobre `dist/` e `node_modules/` no tree novo.
- **R4 — Playwright ausente (browser não baixado):** `npm run e2e` falha sem o browser. Mitigação: `npx playwright install chromium` antes de `npm run e2e`; conferir também `e2e:install`/`e2e:build` se o script exigir build prévio.
- **R5 — DB/Turso para testes:** testes (vitest/e2e) podem exigir `TURSO_DATABASE_URL` ou a réplica local `file:./local-replica.db`. Mitigação: verificar env/`.env` no tree novo; garantir `local-replica.db` gerada (`db:push`/`db:seed` se o fluxo exigir) ou apontar para Turso conforme ambiente; sem rede, usar réplica local (offline-first do projeto).
- **R6 — `electron/` e `electron/staging/backend/` têm package.json próprios:** esquecer um install quebra build/teste do electron. Mitigação: T5 roda install nos 5 locais e valida `npm ls` em cada.
- **R7 — Diferenças entre arquivos locais descartados vs. versao-estavel:** `api.ts`, `layout.tsx`, `main.js` e os `.yml` do electron existem nos dois lados com conteúdo diferente; o stash preserva a versão local caso o usuário queira comparar/recuperar depois (sem risco de sobrescrever o tree novo). Mitigação: não fazer `git stash drop` até o report final ser aceito pelo usuário.
- **R8 — Portas 3000/3001 ocupadas durante e2e/vitest:** e2e sobe servidores e pode conflitar com instâncias dev abertas. Mitigação: fechar dev servers antes de T9/T10; se o e2e exigir base URL customizada, apontar para a porta definida no script.
- **R9 — Node version mismatch:** electron-builder/Next podem exigir versão específica de Node. Mitigação: conferir `engines` nos package.json do tree novo e `node --version` antes de T5.

## Notas
- Estilo do plano segue os planos existentes em `docs/` (mesmo padrão de checklists e `→ Verify`).
- Execução será via `/create`, um agente por tarefa, respeitando o dependency graph.
- Não commitar nada após T5–T10 sem pedido explícito do usuário (`npm install` pode alterar `package-lock.json`; a decisão de commit fica para depois do report T11).