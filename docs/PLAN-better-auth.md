# Avaliação: Better Auth vs Auth Customizado

---

## Status: ANÁLISE

---

## 1. Resumo da Situação Atual

O projeto **não usa Better Auth**. A autenticação é 100% customizada:

| Camada | Implementação | Arquivos-chave |
|--------|---------------|----------------|
| **Backend (Fastify)** | `@fastify/jwt` + `scryptSync` (Node crypto) | `src/routes/auth.ts`, `src/middleware/auth.ts`, `src/lib/password.ts` |
| **Schema DB** | Coluna `password_hash` na tabela `users` (Drizzle/SQLite) | `src/db/schema.ts` |
| **Frontend (Next.js)** | Token + user no `localStorage`, Bearer header em todas as chamadas | `src/lib/api.ts`, `src/app/auth/page.tsx` |
| **WebSocket** | Verificação JWT via `handshake.auth.token` | `src/app.ts` |
| **RBAC** | Middleware `authenticate` + `authorize(roles[])` em cada rota | `src/middleware/auth.ts` |

Funcionalidades atuais: login email/senha, registro, JWT 12h, 3 roles (DEV_MASTER/ADMIN/OPERATOR), rate limit 5/min no login, "Lembrar de mim" (senha em plaintext no localStorage).

---

## 2. O que o Better Auth oferece

| Feature | Better Auth | Auth Atual |
|---------|:-----------:|:----------:|
| Login email/senha | ✅ | ✅ |
| Registro | ✅ | ✅ |
| Sessions (cookie ou JWT) | ✅ (cookie httpOnly por padrão) | JWT manual no localStorage |
| CSRF protection | ✅ automático | ❌ manual |
| Rate limiting | ✅ embutido | ✅ `@fastify/rate-limit` manual |
| Email verification | ✅ plugin | ❌ não existe |
| Reset de senha | ✅ plugin | ❌ não existe |
| Social login (Google, GitHub, etc.) | ✅ plugin | ❌ não existe |
| 2FA / Passkey | ✅ plugin | ❌ não existe |
| Multi-session | ✅ plugin | ❌ não existe |
| Drizzle adapter | ✅ oficial | N/A |
| Fastify integration | ✅ documentado | N/A |
| Role-based access | Via plugin ou custom | ✅ manual (funcional) |
| Rate limit em DB | ✅ (via secondaryStorage) | ✅ (via @fastify/rate-limit) |
| Secret rotation | ✅ `secrets[]` | ❌ |
| Audit log de auth | ✅ hooks | ❌ |

---

## 3. Análise de Custo/Benefício

### 3.1 Benefícios de migrar para Better Auth

**Segurança (ALTO impacto)**
- Sessões via `cookie httpOnly` eliminam o risco de XSS roubar tokens (atualmente tokens ficam no `localStorage`)
- CSRF protection automática (atualmente não existe)
- `emailVerification` impede cadastro com emails falsos
- `sendResetPassword` dá autonomia aos usuários (atualmente só DEV_MASTER pode mudar senha via `/api/users/:id`)
- Secret rotation nativa

**Funcionalidades que faltam (MÉDIO impacto)**
- Email verification na hora do registro
- Esqueci minha senha / reset por email
- Social login se no futuro a gráfica quiser (Google Workspace, por exemplo)
- 2FA para DEV_MASTER (camada extra de segurança para o admin máximo)

**Manutenção (MÉDIO impacto)**
- Remove ~150 linhas de código customizado (`auth.ts`, `password.ts`, `middleware/auth.ts`, `api.ts` token handling)
- Remove dependência de `@fastify/jwt`
- Better Auth é ativamente mantido com releases frequentes

### 3.2 Custos de migrar

**Esforço estimado: MÉDIO (2-4 dias de trabalho)**

| Tarefa | Complexidade | Risco |
|--------|:------------:|:-----:|
| Instalar better-auth + configurar Drizzle adapter | Baixa | Baixo |
| Criar schema Better Auth (tabelas session, account, verification) | Baixa | Baixo |
| Migrar dados de usuários existentes (password_hash → Better Auth format) | Média | **ALTO** |
| Adaptar Fastify handler (`/api/auth/*`) | Baixa | Baixo |
| Adaptar frontend (trocar localStorage token → cookie de sessão) | Média | Médio |
| Adaptar middleware `authenticate`/`authorize` | Média | Médio |
| Adaptar WebSocket auth (cookie → session) | Média | Médio |
| Adaptar `seed.ts` (criar users via Better Auth API) | Baixa | Baixo |
| Remover `@fastify/jwt` e código custom | Baixa | Baixo |
| Adaptar login page (remover "Lembrar de mim" com senha em plaintext) | Baixa | Baixo |

**RISCO PRINCIPAL: Migração de senhas**
- Better Auth usa `argon2` por padrão (ou bcrypt). O projeto atual usa `scrypt` com salt armazenado no formato `salt:hash`.
- Não existe migração automática. Opções:
  1. Re-hash todas as senhas no formato Better Auth (requer que todos os usuários redefinam senha)
  2. Usar `password.hash` e `password.verify` customizados no Better Auth para manter compatibilidade com scrypt
  3. Forçar reset de senha de todos os usuários via script

**BREAKING CHANGES no frontend:**
- O fluxo de token muda de `localStorage` para `cookie httpOnly`
- Todas as chamadas `api()` precisam de `credentials: 'include'`
- O componente `app-gate.tsx` pode precisar de ajuste
- O login page perde "Lembrar de mim" (senhas em localStorage são inseguras)

### 3.3 Custo de NÃO migrar

| Risco | Severidade | Descrição |
|-------|:----------:|-----------|
| Tokens no localStorage | **ALTO** | Vulnerável a XSS — qualquer XSS rouba a sessão |
| Sem CSRF protection | **MÉDIO** | Requisições cross-origin podem ser feitas em nome do usuário |
| Sem email verification | **MÉDIO** | Qualquer pessoa pode criar conta com email falso |
| Sem reset de senha | **BAIXO** | Usuários dependem do DEV_MASTER para mudar senha |
| "Lembrar de mim" com senha em plaintext | **MÉDIO** | Qualquer pessoa com acesso ao PC vê a senha |
| Sem 2FA para admin | **BAIXO** | Risco aceitável para app interno de gráfica |

---

## 4. Recomendação

### Para um app **interno de gráfica** ( LAN, poucos usuários, 3 roles):

**Recomendação: MIGRAÇÃO PARCIAL (híbrida)**

1. **MANTER** o JWT customizado no backend (funciona, é simples, é testado)
2. **ADOTAR** Better Auth **apenas para**: email verification, reset de senha, e sessions via cookie httpOnly
3. **REMOVER** "Lembrar de mim" com senha em plaintext (ou trocar por session cookie persistente)
4. **ADICIONAR** CSRF protection (mesmo que seja um app LAN, é boa prática)
5. **DEPOIS** (futuro): considerar 2FA para DEV_MASTER, social login

**Por que não migração completa agora?**
- O sistema atual **funciona** e atende 100% dos requisitos do RBAC spec
- O app é **interno** (não público) — risco de XSS é menor
- Migração completa tem risco na parte de senhas existentes
- Better Auth é uma dependência pesada (~150KB) para features que podem ser adicionadas incrementalmente

### Se o objetivo for migração completa (futuro):

**Plano de execução (5 fases):**

| Fase | Descrição | Dependências | Agent |
|------|-----------|:------------:|-------|
| **1** | Instalar Better Auth, configurar Drizzle adapter, criar schema | Nenhuma | backend-specialist |
| **2** | Adaptar rotas Fastify (`/api/auth/*`), middleware `authenticate`/`authorize`, WebSocket auth | Fase 1 | backend-specialist |
| **3** | Adaptar frontend: cookie sessions, `credentials: 'include'`, remover token do localStorage | Fase 2 | frontend-specialist |
| **4** | Migrar dados: script de conversão de password_hash scrypt → Better Auth, seed atualizado | Fase 1 | database-architect |
| **5** | Remover código legado (`@fastify/jwt`, `password.ts` custom), testes E2E | Fases 2-4 | test-engineer |

**Critérios de sucesso:**
- [ ] Todos os testes E2E passam (Playwright)
- [ ] Login/logout funcional via Better Auth
- [ ] RBAC (3 roles) mantido sem regressão
- [ ] WebSocket auth funcional
- [ ] Senhas existentes migradas ou users forçados a resetar
- [ ] Nenhum token em localStorage
- [ ] CSRF protection ativa

---

## 5. Decisão

**Pergunta ao usuário (Socratic Gate):**

Antes de criar um plano detalhado de implementação, qual é a direção?

| Opção | Descrição |
|-------|-----------|
| **A** | Manter auth customizado, apenas corrigir vulnerabilidades (token→cookie, remover "lembrar senha") |
| **B** | Migração parcial: Better Auth para sessions/verification/reset, manter JWT custom no backend |
| **C** | Migração completa: substituir tudo pelo Better Auth |
| **D** | Não fazer nada agora, apenas registrar esta análise como ADR |
