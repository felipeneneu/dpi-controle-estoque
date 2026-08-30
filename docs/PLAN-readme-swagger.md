# PLAN: README do projeto + Documentação Swagger (OpenAPI)

## Goal
Criar a documentação oficial em PT-BR do monorepo **GraficaOS**: um `README.md` na raiz cobrindo todo o sistema (frontend + backend) e habilitar a **documentação de API dinâmica via Swagger/OpenAPI** no backend Fastify (porta 3001), usando `@fastify/swagger` + `@fastify/swagger-ui`. Sem templates — o conteúdo é específico deste projeto.

## Tasks

- [ ] **1. Instalar dependências Swagger no backend** — em `grafica-app/backend/`: instalar `@fastify/swagger` e `@fastify/swagger-ui` (compatíveis com Fastify ^5).
  → Verify: entradas presentes em `grafica-app/backend/package.json` + `npm ls @fastify/swagger @fastify/swagger-ui` sem erro.

- [ ] **2. Registrar swagger + swagger-ui em `server.ts`** — antes das rotas, registrar `@fastify/swagger` (OpenAPI 3.0.3, `info.title`="GraficaOS API", `description` e `version` em PT-BR) e `@fastify/swagger-ui` (rota UI `/documentation`), além de definir o security scheme `bearerAuth` (tipo http, scheme bearer) ligado ao JWT (`app.jwt`). Como as rotas ainda não usam `schema:`, o swagger inferirá apenas paths + métodos HTTP.
  → Verify: `npm run dev:backend` inicia na 3001; `GET http://localhost:3001/documentation/json` retorna JSON válido com `openapi: "3.0.3"` e o `securitySchemes.bearerAuth` definido; `GET /documentation` renderiza a Swagger UI.

- [ ] **3. Enriquecer rotas com tags + summaries (JSON Schema)** — adicionar em cada rota (`auth`, `stock`, `machines`, `suppliers`, `users`, `chat`, `notifications`, `whatsapp`) o campo `schema: { tags: [...], summary: "...", body/response ... }` (JSON Schema convertido dos schemas zod já existentes) para que `/documentation/json` liste os paths agrupados por recurso, com resumo e request body. Adicionar tag "Autenticação" levando `bearerAuth` nos endpoints protegidos.
  → Verify: `/documentation/json` contém paths como `/api/auth/login` com `requestBody` schema, e os demais grupos (Estoque, Máquinas, Fornecedores, Usuários, Chat, Notificações, WhatsApp) agrupados por `tags`.

- [ ] **4. Criar `README.md` raiz (PT-BR)** — na raiz do repo, documento cobrindo: visão geral do sistema (controle de estoque/maquinário para gráfica); arquitetura (monorepo: frontend `grafica-app/` Next.js, backend `grafica-app/backend/` Fastify + Drizzle + Turso LibSQL, Socket.IO realtime, WhatsApp via Baileys); pré-requisitos; como rodar (`npm run db:push`, `npm run db:seed`, `npm run dev:ui`, `npm run dev:backend`); tabela de scripts do `package.json` raiz (dev:ui, dev:backend, build:export, build:backend, db:push, db:seed, lint, package:electron); link para a documentação Swagger `/documentation`; e links para a pasta `docs/` (PRD, TRD, FRD, HLD, LLD, ADR, RBAC).
  → Verify: `README.md` existe na raiz e renderiza no GitHub; os comandos batem **exatamente** com os scripts do `package.json` raiz; links para `docs/00x_*` e para `/documentation` funcionam.

- [ ] **5. Substituir README padrão do frontend** — remover o boilerplate `create-next-app` em `grafica-app/README.md` e deixar um ponteiro curto em PT-BR para o `README.md` raiz (ex.: "Documentação completa do projeto em ../README.md").
  → Verify: `grafica-app/README.md` não contém mais texto `create-next-app`; contém link relativo válido para a raiz.

- [ ] **6. Verificação final** — rodar `npm run dev:backend`, `npm run db:push`/`db:seed` (se necessário), abrir `http://localhost:3001/documentation` e conferir o spec JSON completo; `npm run lint` no backend; conferir que `README.md` reflete 100% dos scripts atuais; revisar que não usamos templates nem paleta/violeta de exemplo.
  → Verify: Swagger UI carrega, spec JSON valida contra OpenAPI 3.0.3, lint OK, e README condizente com o estado real do monorepo.

## Done When
- [ ] Backend expõe Swagger/OpenAPI dinâmico em `http://localhost:3001/documentation` (+ JSON) em PT-BR, com rotas agrupadas por tags. ✔
- [ ] `README.md` raiz em PT-BR documenta visão geral, arquitetura, pré-requisitos, como rodar e scripts reais do monorepo, com links para `docs/` e `/documentation`. ✔
- [ ] `grafica-app/README.md` é apenas um ponteiro para a raiz (sem boilerplate). ✔
- [ ] Lint/build do backend passam; documentação condizente com o código atual. ✔

## Notas
- **Backend é serviço separado na porta 3001** — Swagger pertence ao backend, não ao Next (que é UI estática `output: 'export'`).
- As rotas **não** usam `schema:` hoje (validam com `zod.safeParse` no handler). O passo 3 adiciona o schema JSON para a spec ficar útil; converter dos schemas zod já existentes.
- `app.jwt` já está registrado — o scheme `bearerAuth` do Swagger aponta para o mesmo token emitido em `/api/auth/login` e `/api/auth/register`.
- Agentes sugeridos: `backend-specialist` (steps 1–3) e `documentation-templates` + `backend-specialist` (steps 4–5); `lint-and-validate` e `webapp-testing` para o step 6.
