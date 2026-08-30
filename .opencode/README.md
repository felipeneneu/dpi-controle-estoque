# Jarvis Kit

> Framework de agentes IA para [OpenCode](https://opencode.ai) — 19 agents, 40 skills, 12 commands prontos para usar.

---

## O que é

O Jarvis Kit é um toolkit modular que transforma o OpenCode em um sistema de agentes especializados. Copie a pasta `.opencode` para qualquer projeto e tenha acesso instantâneo a:

- **19 Agents** especializados (frontend, backend, segurança, testes, etc.)
- **40 Skills** domain-specific (React, Next.js, Tailwind, banco de dados, etc.)
- **12 Commands** slash para workflows rápidos
- **Scripts de validação** automatizada

## Instalação

### 1. Copiar para seu projeto

```bash
# Opção A: Clonar o repositório
git clone https://github.com/<seu-usuario>/jarvis-kit.git .opencode

# Opção B: Copiar manualmente
cp -r jarvis-kit/.opencode /caminho/do/seu/projeto/
```

### 2. Instalar dependências

```bash
cd .opencode
npm install
```

### 3. Personalizar (opcional)

Edite os arquivos em `references/` para documentar as regras do seu projeto:

- `references/PROJECT_RULES.md` — convenções e regras de negócio
- `references/ARCHITECTURE_RULES.md` — rotas, componentes, estrutura
- `references/DATABASE_RULES.md` — schema do banco de dados

## Uso

### Agents

Invque um agent com `@nome-do-agent`:

```
@frontend-specialist crie um component de login
@backend-specialist crie uma API REST para usuários
@database-architect projete o schema de um blog
@security-auditor analise este endpoint
```

### Commands

Use comandos slash:

```
/plan criar um SaaS dashboard
/create e-commerce com carrinho
/debug erro de autenticação
/test rodar todos os testes
/deploy produção
```

### Skills

Skills são carregadas automaticamente pelos agents conforme necessário. Não é preciso invocar manualmente.

## Agents Disponíveis

| Agent | Uso |
|-------|-----|
| `backend-specialist` | API, server logic, Node.js, Python |
| `frontend-specialist` | React, Next.js, UI, CSS, responsivo |
| `database-architect` | Schema, queries, migrations, ORM |
| `security-auditor` | Vulnerabilidades, OWASP, autenticação |
| `test-engineer` | Testes unitários, E2E, cobertura |
| `devops-engineer` | Deploy, CI/CD, Docker, monitoramento |
| `performance-optimizer` | Core Web Vitals, bundle, profiling |
| `mobile-developer` | React Native, Flutter, iOS, Android |
| `game-developer` | Unity, Godot, Phaser, Three.js |
| `penetration-tester` | Pentest, exploits, red team |
| `orchestrator` | Coordenação multi-agent |
| `project-planner` | Planejamento e breakdown de tarefas |
| `product-manager` | Requirements, user stories |
| `code-archaeologist` | Legado, refatoração, análise |
| `debugger` | Debug sistemático, root cause |
| `documentation-writer` | README, docs, changelog |
| `explorer-agent` | Análise profunda de codebase |
| `qa-automation-engineer` | Playwright, Cypress, CI |
| `seo-specialist` | SEO, GEO, Core Web Vitals |

## Skills Disponíveis

| Skill | Descrição |
|-------|-----------|
| `react-patterns` | Padrões modernos React, hooks, performance |
| `nextjs-best-practices` | App Router, Server Components, data fetching |
| `tailwind-patterns` | Tailwind CSS v4, container queries |
| `nodejs-best-practices` | Node.js, async patterns, segurança |
| `python-patterns` | Python, frameworks, type hints |
| `database-design` | Schema design, indexing, ORM selection |
| `api-patterns` | REST vs GraphQL vs tRPC |
| `frontend-design` | Design thinking, UI/UX |
| `mobile-design` | Mobile-first, touch, performance |
| `testing-patterns` | Unit, integration, mocking |
| `tdd-workflow` | Test-Driven Development |
| `clean-code` | Padrões de código limpo |
| `code-review-checklist` | Checklist de code review |
| `lint-and-validate` | Linting e análise estática |
| `vulnerability-scanner` | OWASP 2025,供应链安全 |
| `red-team-tactics` | MITRE ATT&CK, táticas ofensivas |
| `performance-profiling` | Medição e otimização |
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | Generative Engine Optimization |
| `i18n-localization` | Internacionalização |
| `deployment-procedures` | Deploy seguro, rollback |
| `server-management` | Process management, monitoramento |
| `architecture` | Decisões arquiteturais, ADR |
| `mcp-builder` | MCP server building |
| `plan-writing` | Planejamento estruturado |
| `parallel-agents` | Orquestração multi-agent |
| `brainstorming` | Exploração de ideias |
| `documentation-templates` | Templates de documentação |
| `systematic-debugging` | Metodologia de debug |
| `better-auth-best-practices` | Autenticação com Better Auth |
| `email-and-password-best-practices` | Auth email/senha |
| `bash-linux` | Terminal Linux/macOS |
| `powershell-windows` | Terminal Windows |
| `app-builder` | Construção de apps completos |

## Commands Disponíveis

| Command | Descrição |
|---------|-----------|
| `/plan` | Planejar feature (sem código) |
| `/create` | Criar aplicação do zero |
| `/debug` | Investigar bug sistematicamente |
| `/test` | Gerar e rodar testes |
| `/deploy` | Deploy em produção |
| `/enhance` | Adicionar feature iterativa |
| `/orchestrate` | Coordenar múltiplos agents |
| `/brainstorm` | Explorar ideias com opções |
| `/audit-route` | Auditar rota específica |
| `/preview` | Gerenciar servidor de preview |
| `/status` | Status do projeto |
| `/ui-ux-pro-max` | Design intelligence avançado |

## Estrutura

```
.opencode/
├── agents/          # 19 specialist agents (.md)
├── skills/          # 40 skills (com scripts e dados)
├── commands/        # 12 slash commands
├── scripts/         # Scripts de validação
├── .shared/         # Dados compartilhados (UI/UX)
├── references/      # Regras do seu projeto (preencha)
├── plans/           # Planos de implementação
├── INSTRUCTIONS.md  # Regras globais (sempre carregado)
├── ARCHITECTURE.md  # Documentação do toolkit
├── TUTORIAL.md      # Tutorial em PT-BR
└── package.json     # Plugin do OpenCode
```

## Scripts de Validação

```bash
# Checklist completo
python .opencode/scripts/checklist.py .

# Com URL para checks de performance
python .opencode/scripts/checklist.py . --url http://localhost:3000

# Verificação completa (pré-deploy)
python .opencode/scripts/verify_all.py . --url http://localhost:3000
```

## Como Personalizar

### Adicionar novo agent

Crie um arquivo `.md` em `agents/`:

```markdown
---
name: meu-agent
description: Descrição do agent
skills: [skill1, skill2]
---

# Meu Agent

Regras e instruções do agent aqui...
```

### Adicionar nova skill

Crie uma pasta em `skills/` com:

```
skills/minha-skill/
├── SKILL.md          # Índice da skill
├── section1.md       # Seções de conteúdo
└── scripts/          # Scripts auxiliares (opcional)
```

### Adicionar novo command

Crie um arquivo `.md` em `commands/`:

```markdown
---
name: meu-command
description: Descrição do command
agent: frontend-specialist
---

# /meu-command

Fluxo de execução do command aqui...
```

## Licença

MIT — use livremente em qualquer projeto.

## Créditos

Baseado no [Antigravity Kit](https://github.com/) — framework de agentes IA para OpenCode.
