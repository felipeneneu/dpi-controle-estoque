# PLAN: Exe Release, Icon Fix & Stability Validation

**Data:** 2026-09-11
**Branch:** `feat/correcoes-usuarios-notificacoes-whatsapp`
**Versão-alvo:** `v1.0.0`
**Status:** PLANNING

---

## Objetivo

Preparar o projeto para release como `.exe` (Server + Client) com:
1. Ícone do atalho/app funcionando (não mais ícone padrão do Electron)
2. Avatares carregando corretamente no `.exe` empacotado
3. Aplicação 100% testada e estável
4. Segurança adequada para uso interno em LAN
5. Subir para Git com branch + tag da versão

---

## Decisões do Usuário (Socratic Gate)

| Pergunta | Resposta |
|---|---|
| Versão | **v1.0.0** (bump todos package.json) |
| Electron upgrade | **Manter Electron 33** (risco aceitável para LAN interno) |
| Node.js no Server | **Bundlar node.exe** no installer |
| Segurança | **Fix críticos** (remover .env do installer, gerar secrets por-install) — TLS e discovery auth ficam para depois |
| Avatares | **Manter os 3 atuais** (felipeneneu, gustavo, vlademir) |

---

## FASE 1: Fix do Ícone (Bloqueador)

### Problema
- `electron-builder.yml`, `electron-builder.server.yml`, `electron-builder.client.yml` todos têm `signAndEditExecutable: false`
- Isso impede o `rcedit` de gravar o ícone no `.exe` resultante
- Atalho Windows e barra de tarefas mostram ícone padrão do Electron

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 1.1 | Remover `signAndEditExecutable: false` dos 3 YAMLs | `electron/electron-builder.yml`, `electron/electron-builder.server.yml`, `electron/electron-builder.client.yml` | devops-engineer |
| 1.2 | Adicionar `sign: null` para pular signing mas manter rcedit | Idem | devops-engineer |
| 1.3 | Atualizar `make-icon.mjs` para gerar ICO com mais tamanhos (16, 24, 32, 48, 64, 128, 256) | `electron/scripts/make-icon.mjs` | devops-engineer |
| 1.4 | Regenerar `electron/build/icon.ico` com os novos tamanhos | `electron/build/icon.ico` | devops-engineer |
| 1.5 | Verificar que `electron-builder.yml` (base) inclui `build/icon.png` no `files:` | `electron/electron-builder.yml` | devops-engineer |

### Verificação
- [ ] `npm run package:client` gera `.exe` com ícone customizado
- [ ] Atalho na área de trabalho mostra o ícone correto
- [ ] Ícone aparece na barra de tarefas
- [ ] Desinstalador mostra ícone correto

---

## FASE 2: Fix dos Avatares no Empacotamento (Bloqueador)

### Problema
- `grafica-app/backend/src/lib/paths.ts` resolve `USERS_PUBLIC_DIR` para `../../../public/users/`
- No empacotado, isso aponta para `resources/graficaos/public/users/` — **diretório não existe**
- `backend/public/` foi deletado neste changeset
- Resultado: `GET /users/` → 404, avatares não carregam

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 2.1 | Adicionar `extraResources` no `electron-builder.server.yml` para copiar avatares | `electron/electron-builder.server.yml` | devops-engineer |
| 2.2 | Adicionar `extraResources` no `electron-builder.yml` (base) idem | `electron/electron-builder.yml` | devops-engineer |
| 2.3 | Verificar que `grafica-app/public/users/` tem os 3 arquivos | `grafica-app/public/users/` | devops-engineer |
| 2.4 | Redimensionar `vlademir.png` de 2.2 MB para ~128-256px WebP | `grafica-app/public/users/vlademir.png` | performance-optimizer |
| 2.5 | Adicionar `loading="lazy" decoding="async"` no `AvatarImage` | `grafica-app/src/components/ui/avatar.tsx` | performance-optimizer |
| 2.6 | Adicionar cache headers no `@fastify/static` para `/users/` | `grafica-app/backend/src/app.ts` | performance-optimizer |

### Verificação
- [ ] `npm run package:server` → avatares acessíveis em `GET /users/<file>`
- [ ] `GET /api/user-photos` retorna os 3 arquivos
- [ ] Avatares carregam no client conectado via LAN ao server empacotado
- [ ] vlademir.png < 200KB após redimensionamento

---

## FASE 3: Fix do Servidor no Installer (Bloqueador)

### Problema
- `electron-builder.server.yml` empacota de `staging/backend` mas CI não popula esse diretório
- `spawn('node')` requer Node.js no PATH da máquina alvo

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 3.1 | Decidir estratégia: manter `staging/` com CI step OU reverter para `from: ../grafica-app/backend` | `electron-builder.server.yml`, `.github/workflows/ci.yml` | devops-engineer |
| 3.2 | Bundlar `node.exe` (v22 LTS, ~30MB) como extraResource | `electron/staging/` ou `electron/build/` | devops-engineer |
| 3.3 | Atualizar `main.js` para usar node.exe bundled via `GRAFICA_NODE` | `electron/main.js` | devops-engineer |
| 3.4 | Atualizar CI para popular `staging/backend/dist` antes de empacotar | `.github/workflows/ci.yml` | devops-engineer |
| 3.5 | Remover `.env` do `extraResources` no server.yml | `electron/electron-builder.server.yml` | penetration-tester |
| 3.6 | Garantir que `main.js` gera secrets por-install no primeiro boot | `electron/main.js` | penetration-tester |

### Verificação
- [ ] Server .exe instala e inicia backend sem Node.js no PATH
- [ ] `GET /health` retorna 200 após boot
- [ ] Nenhum `.env` empacotado no installer (verificar com 7-Zip)
- [ ] JWT_SECRET gerado aleatoriamente no primeiro boot

---

## FASE 4: Segurança (Críticos)

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 4.1 | Remover `.env` de todos os `extraResources` | `electron-builder.server.yml` | penetration-tester |
| 4.2 | Gerar JWT_SECRET aleatório no primeiro boot (já existe fallback em `main.js`) | `electron/main.js` | penetration-tester |
| 4.3 | Escopar regra de firewall para `remoteip=localSubnet` | `electron/main.js` | penetration-tester |
| 4.4 | Adicionar `app.requestSingleInstanceLock()` | `electron/main.js` | penetration-tester |
| 4.5 | Corrigir `isBackendUp()` para usar `backendPort()` | `electron/main.js` | penetration-tester |
| 4.6 | Fix 500 responses: retornar mensagem genérica, log server-side | `grafica-app/backend/src/app.ts` | penetration-tester |
| 4.7 | Atualizar `xlsx` para versão patchada (CDN tarball 0.20.3) | `grafica-app/backend/package.json` | penetration-tester |

### Verificação
- [ ] `npm audit` não mostra HIGH/CRITICAL para runtime dependencies
- [ ] Firewall rule usa `remoteip=localSubnet`
- [ ] Double-launch não cria processos duplicados
- [ ] 500 errors não vazam `error.message`

---

## FASE 5: Testes e Estabilidade

### Estado Atual
- ✅ 56/56 testes backend passando (vitest)
- ✅ 2 specs E2E (playwright): auth + estoque
- ⚠️ Sem testes para: machines, suppliers, chat, reports, jobs, mimaki, whatsapp
- ⚠️ Zero testes frontend/Electron
- ⚠️ `math.test.ts` em `__tests__/` não é executado pelo vitest

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 5.1 | Adicionar teste para `/api/user-photos` | `grafica-app/backend/tests/routes/users.test.ts` | test-engineer |
| 5.2 | Mover `math.test.ts` para `tests/` ou remover | `grafica-app/backend/src/lib/__tests__/math.test.ts` | test-engineer |
| 5.3 | Rodar `npm run lint` em todos os sub-projetos | root, grafica-app, grafica-app/backend | lint-and-validate |
| 5.4 | Rodar `npm run typecheck` no backend | `grafica-app/backend/` | lint-and-validate |
| 5.5 | Rodar todos os testes e confirmar 100% pass | root (`npm test`) | test-engineer |
| 5.6 | Build completo: `npm run build:export && npm run build:backend` | root | devops-engineer |

### Verificação
- [ ] `npm test` → 0 failures
- [ ] `npm run lint` → 0 errors
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run build:export` → exit 0
- [ ] `npm run build:backend` → exit 0

---

## FASE 6: Versionamento e Git

### Tarefas

| # | Tarefa | Arquivos | Agente |
|---|---|---|---|
| 6.1 | Bump versão para `1.0.0` em todos os `package.json` | root, grafica-app, grafica-app/backend, electron | documentation-writer |
| 6.2 | Sincronizar `package-lock.json` em todos os níveis | root, grafica-app, grafica-app/backend, electron | devops-engineer |
| 6.3 | Atualizar README.md: status v1.0.0, corrigir licença MIT, adicionar seção desktop | `README.md` | documentation-writer |
| 6.4 | Atualizar `docs/15_RELEASE_NOTES.md` com data correta | `docs/15_RELEASE_NOTES.md` | documentation-writer |
| 6.5 | Fechar PLANs implementados (marcar `PLAN-mimaki-integration.md` como Implemented) | `docs/PLAN-mimaki-integration.md` | documentation-writer |
| 6.6 | Limpar arquivos temporários da staged area | `.agents/`, `*.tmp`, `htmlteste.html` | devops-engineer |
| 6.7 | Commit final na branch | - | devops-engineer |
| 6.8 | Merge branch → main via PR | - | devops-engineer |
| 6.9 | Tag `v1.0.0` no main | - | devops-engineer |

### Workflow Git Recomendado

```bash
# 1. Na feature branch, após todos os fixes:
git add -A
git commit -m "feat: v1.0.0 — icon fix, avatar packaging, security hardening, node bundling"

# 2. Push e PR para main
git push origin feat/correcoes-usuarios-notificacoes-whatsapp

# 3. Após merge no main:
git checkout main && git pull origin main

# 4. Tag (dispara CI → GitHub Release com .exe)
git tag -a v1.0.0 -m "GraficaOS v1.0.0 — LAN Server/Client"
git push origin v1.0.0
```

### Verificação
- [ ] Todos os `package.json` mostram `1.0.0`
- [ ] `npm ci` funciona em todos os níveis
- [ ] README reflete v1.0.0 com licença MIT
- [ ] Release notes com data correta
- [ ] Branch limpa (sem arquivos temporários)
- [ ] CI passa: typecheck + tests + lint + build + e2e
- [ ] Tag `v1.0.0` existe e dispara GitHub Release

---

## Resumo de Agentes

| Agente | Responsabilidades |
|---|---|
| **devops-engineer** | Fix icons YAML, make-icon.mjs, packaging pipeline, CI workflow, git workflow, node bundling |
| **penetration-tester** | Remover .env, security hardening (firewall, single-instance, error leaks, xlsx) |
| **performance-optimizer** | Avatar resize, cache headers, lazy loading, rate limit |
| **documentation-writer** | Version bump, README update, release notes, PLANs cleanup |
| **test-engineer** | User-photos test, math.test.ts fix, test validation |
| **lint-and-validate** | Lint, typecheck, build validation |

---

## Checklist Final de Verificação

- [ ] Ícone do app/atalho/shows o logo customizado (não Electron)
- [ ] Avatares carregam no Server .exe empacotado
- [ ] Avatares carregam no Client conectado via LAN
- [ ] Server .exe inicia sem Node.js no PATH
- [ ] Nenhum `.env` empacotado no installer
- [ ] JWT_SECRET gerado por-install
- [ ] 56+ testes passando
- [ ] Lint sem erros
- [ ] Typecheck sem erros
- [ ] Build completo sem erros
- [ ] Versão 1.0.0 em todos os package.json
- [ ] README atualizado
- [ ] Branch limpa e mergida
- [ ] Tag v1.0.0 criada
- [ ] GitHub Release publicada com .exe

---

## Riscos e Notas

1. **Electron 33 EOL** — mantido por decisão do usuário. Documentar limitações nas release notes.
2. **Sem TLS** — aceito para LAN interna. Se rede for compartilhada/guest, considerar HTTPS futuro.
3. **UDP discovery spoofable** — aceito para LAN interna com física controlada.
4. **node.exe bundling** — adiciona ~30MB ao installer. Aceito pelo usuário.
5. **xlsx vulnerability** — patchear antes do release (CVE-2023-30533 é HIGH).
