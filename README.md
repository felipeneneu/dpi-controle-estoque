# GraficaOS — Controle de Estoque para Gráfica

Sistema de controle de estoque e maquinário para gráfica / comunicação visual. Gerencia insumos (papéis, bobinas de vinil, tintas), máquinas, fornecedores, usuários e alertas de estoque crítico — com notificações em tempo real e integração com WhatsApp.

> **Status:** v0.1.0 (versão web)

## Funcionalidades

- **Controle de estoque** — itens com categoria (mídia de papel, tinta, outro), unidade, quantidade atual/mínima e status automático (`AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK`).
- **Registro de transações** — entradas (`IN`), saídas (`OUT`) e ajustes (`ADJUSTMENT`).
- **Maquinário** — cadastro de máquinas e vínculo com os materiais que consomem.
- **Alertas** — notificação em tempo real (Socket.IO) e disparo de WhatsApp quando um item fica com estoque baixo ou zerado.
- **Chat interno** — mensagens em tempo real entre equipe.
- **RBAC** — perfis `DEV_MASTER`, `ADMIN` e `OPERATOR` com permissões restritas por endpoint.
- **API documentada** — Swagger/OpenAPI em `http://localhost:3001/documentation`.

## Arquitetura

Monorepo com frontend e backend separados:

```
.
├── grafica-app/               # Frontend (Next.js 16 + React 19 + Tailwind v4)
│   └── backend/               # API (Fastify 5 + Drizzle ORM + Turso LibSQL)
├── docs/                      # Documentação do projeto (PRD, TRD, FRD, HLD, LLD, RBAC…)
└── package.json               # Scripts de orquestração (raiz)
```

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn, Socket.IO client |
| Backend | Fastify 5, Drizzle ORM, Turso LibSQL (SQLite), Socket.IO |
| Integrações | WhatsApp via Baileys, alertas de estoque |
| Autenticação | JWT (`@fastify/jwt`) com RBAC |

## Pré-requisitos

- Node.js 20.6+ (necessário para `--env-file`)
- npm

## Como rodar

### 1. Instalar dependências

```bash
npm --prefix grafica-app install
npm --prefix grafica-app/backend install
```

### 2. Configurar ambiente

O backend usa um arquivo `.env`. Copie o exemplo e ajuste conforme necessário:

```bash
cp grafica-app/backend/.env.example grafica-app/backend/.env
```

Sem `TURSO_DATABASE_URL`, o backend usa um arquivo local `local-replica.db` — ideal para desenvolvimento offline.

### 3. Criar e popular o banco

```bash
npm run db:push     # aplica o schema (Drizzle)
npm run db:seed     # popula dados de exemplo (se o banco estiver vazio)
```

Usuários de exemplo criados pelo seed:

| Email | Senha | Perfil |
|-------|-------|--------|
| `felipe@grafica.local` | `admin123` | DEV_MASTER |
| `operador@grafica.local` | `operador123` | OPERATOR |

### 4. Subir o sistema

```bash
npm run dev:ui       # frontend -> http://localhost:3000
npm run dev:backend  # api     -> http://localhost:3001
```

## Scripts (raiz)

| Script | Descrição |
|--------|-----------|
| `npm run dev:ui` | Sobe o frontend Next.js em modo desenvolvimento |
| `npm run dev:backend` | Sobe a API Fastify em modo desenvolvimento (watcher) |
| `npm run build:export` | Gera o build estático do frontend |
| `npm run build:backend` | Compila o backend (TypeScript) |
| `npm run db:push` | Aplica o schema do banco (Drizzle) |
| `npm run db:seed` | Popula dados de exemplo |
| `npm run lint` | Executa ESLint no frontend e no backend |
| `npm run package:electron` | Empacota a versão desktop (Electron) |

## Documentação da API (Swagger)

Com o backend rodando:

- **Swagger UI:** `http://localhost:3001/documentation`
- **Spec JSON (OpenAPI 3.0.3):** `http://localhost:3001/documentation/json`

Todos os endpoints protegidos exigem o token JWT obtido em `POST /api/auth/login` — use o botão **Authorize** na interface do Swagger para autenticar.

## Documentação do projeto

A pasta [docs/](docs/) contém a documentação completa do sistema:

- [01 — PRD — Product Requirements](docs/01_PRD_PRODUCT_REQUIREMENTS.md)
- [02 — TRD — Technical Requirements](docs/02_TRD_TECHNICAL_REQUIREMENTS.md)
- [03 — FRD — Functional Requirements](docs/03_FRD_FUNCTIONAL_REQUIREMENTS.md)
- [04 — User Stories](docs/04_USER_STORIES.md)
- [05 — HLD — High Level Design](docs/05_SYSTEM_DESIGN_HLD.md)
- [06 — LLD — Low Level Design](docs/06_LOW_LEVEL_DESIGN_LLD.md)
- [07 — ADR / RFC — Decisões Técnicas](docs/07_TECHNICAL_DECISIONS_ADR_RFC.md)
- [08 — Engineering Guidelines](docs/08_ENGINEERING_GUIDELINES.md)
- [09 — Ops & Infraestrutura](docs/09_OPS_AND_INFRASTRUCTURE.md)
- [10 — RBAC Specification](docs/10_RBAC_SPECIFICATION.md)

## Perfis e permissões

| Perfil | Acesso |
|--------|--------|
| `DEV_MASTER` | Acesso total (inclui exclusões e gestão de usuários) |
| `ADMIN` | Gerencia cadastros de insumos, máquinas, fornecedores e ajustes de estoque |
| `OPERATOR` | Registra saídas/baixas de materiais e usa o chat |

## Licença

Privado — uso interno.