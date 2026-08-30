# Tutorial Completo: Como Usar a Pasta `.opencode/`

> Guia pratico para dominar o Antigravity Kit no OpenCode.

---

## 1. Visao Geral

A pasta `.opencode/` e o **centro de controle** do OpenCode para este projeto. Quando voce inicia o OpenCode neste diretorio, ele **automaticamente descobre** todos os agents, commands e skills dessa pasta.

**O que acontece ao iniciar:**
```
opencode inicia
    |
    +-- Le .opencode/INSTRUCTIONS.md (regras globais)
    +-- Descobre .opencode/agents/*.md (19 subagentes)
    +-- Descobre .opencode/commands/*.md (11 comandos)
    +-- Descobre .opencode/skills/*/SKILL.md (36 habilidades)
```

**Nao e necessario configurar nada.** Basta estar na pasta do projeto e rodar `opencode`.

---

## 2. Estrutura de Diretorios

```
.opencode/
|
|-- ARCHITECTURE.md        # Visao geral do sistema (referencia)
|-- INSTRUCTIONS.md        # Regras globais (SEMPRE carregadas)
|-- .gitignore             # Arquivos ignorados pelo git
|
|-- agents/                # 19 Subagentes especializados
|   |-- backend-specialist.md
|   |-- frontend-specialist.md
|   |-- orchestrator.md
|   |-- ... (19 arquivos)
|
|-- commands/              # 11 Comandos slash (/comando)
|   |-- brainstorm.md
|   |-- create.md
|   |-- debug.md
|   |-- ... (11 arquivos)
|
|-- skills/                # 36 Modulos de conhecimento
|   |-- api-patterns/
|   |   |-- SKILL.md       # Indice + instrucoes
|   |   |-- scripts/       # Scripts de validacao
|   |   |-- rest.md        # Documentacao adicional
|   |   |-- ...
|   |-- clean-code/
|   |   |-- SKILL.md
|   |-- ...
|
|-- scripts/               # Scripts mestre de validacao
|   |-- checklist.py       # Validacao priorizada
|   |-- verify_all.py      # Verificacao completa
|
|-- references/            # Regras do projeto
|   |-- PROJECT_RULES.md
|   |-- ARCHITECTURE_RULES.md
|   |-- APPWRITE_RULES.md
|
|-- .shared/               # Dados compartilhados (UI/UX)
    |-- ui-ux-pro-max/
        |-- data/           # CSVs com estilos, cores, fontes
        |-- scripts/        # Motor de busca de design
```

---

## 3. Agents (Subagentes)

Agents sao **assistentes especializados** que voce invoca com `@nome` no chat do OpenCode.

### Como usar

No input do chat, digite `@` e o nome do agent:

```
@backend-specialist crie uma API de autenticacao
@frontend-specialist melhore o layout da pagina
@debugger investigue o erro no checkout
```

### Lista Completa de Agents

| Agent | Para que serve | Exemplo de uso |
|-------|---------------|----------------|
| `@orchestrator` | Coordenar 3+ agentes para tarefas complexas | `@orchestrator refatorar o modulo de pagamentos` |
| `@project-planner` | Planejar e quebrar tarefas em passos | `@project-planner crie um plano para o dashboard` |
| `@frontend-specialist` | UI/UX, React, Next.js, CSS, Tailwind | `@frontend-specialist crie um componente de card` |
| `@backend-specialist` | API, Node.js, Python, seguranca | `@backend-specialist crie endpoint de CRUD` |
| `@database-architect` | Schema SQL, migracoes, otimizacao | `@database-architect otimize esta query` |
| `@mobile-developer` | React Native, Flutter, iOS, Android | `@mobile-developer crie tela de login` |
| `@game-developer` | Logica de jogos, mecanicas | `@game-developer crie sistema de inventario` |
| `@devops-engineer` | CI/CD, Docker, deploy | `@devops-engineer crie pipeline de deploy` |
| `@security-auditor` | Auditoria de seguranca, OWASP | `@security-auditor audite a autenticacao` |
| `@penetration-tester` | Teste ofensivo, vulnerabilidades | `@penetration-tester teste as APIs` |
| `@test-engineer` | Testes unitarios, E2E, cobertura | `@test-engineer gere testes para o servico` |
| `@debugger` | Analise sistematica de bugs | `@debugger investigue o erro 500 no login` |
| `@performance-optimizer` | Otimizacao, Web Vitals | `@performance-optimizer melhore o LCP` |
| `@seo-specialist` | SEO, Core Web Vitals, ranking | `@seo-specialist optimize meta tags` |
| `@documentation-writer` | Documentacao tecnica | `@documentation-writer documente a API` |
| `@product-manager` | Requisitos, user stories | `@product-manager defina requisitos do carrinho` |
| `@qa-automation-engineer` | Testes E2E, pipelines CI | `@qa-automation-engineer crie suite E2E` |
| `@code-archaeologist` | Codigo legado, refatoracao | `@code-archaeologist limpe este componente` |
| `@explorer-agent` | Analise do codebase (somente leitura) | `@explorer-agent mapeie os endpoints da API` |

### Hierarquia de Agents

```
Voce (humano)
    |
    +-- /orchestrate (comando que coordena agentes)
         |
         +-- @project-planner (fase de planejamento)
         +-- @frontend-specialist (implementacao frontend)
         +-- @backend-specialist (implementacao backend)
         +-- @test-engineer (verificacao)
```

---

## 4. Commands (Comandos Slash)

Commands sao **atalhos para fluxos de trabalho**. Digite `/` no chat para ver os disponiveis.

### Como usar

```
/criar pagina de login
/debug API retorna 500
/deploy production
/test src/services/auth.ts
```

### Lista Completa de Comandos

| Comando | O que faz | Exemplo |
|---------|-----------|---------|
| `/brainstorm` | Explora ideias antes de implementar (sem codigo) | `/brainstorm sistema de autenticacao` |
| `/create` | Cria nova feature/aplicacao completa | `/create pagina de carrinho` |
| `/debug` | Investigacao sistematica de bugs | `/debug formulario nao envia` |
| `/deploy` | Deploy com pre-flight checks | `/deploy production` |
| `/enhance` | Adiciona ou melhora features existentes | `/enhance adicionar dark mode` |
| `/orchestrate` | Coordena 3+ agentes para tarefa complexa | `/orchestrate refatorar modulo de pagamentos` |
| `/plan` | Cria plano de tarefa (SEM escrever codigo) | `/plan dashboard com analytics` |
| `/preview` | Gerencia servidor de preview local | `/preview start` |
| `/status` | Mostra status do projeto e agentes | `/status` |
| `/test` | Roda ou gera testes | `/test` ou `/test src/auth.ts` |
| `/ui-ux-pro-max` | Design com 50+ estilos e paletas | `/ui-ux-pro-max landing page fintech` |

### Sub-comandos

Alguns comandos tem sub-comandos:

```
/deploy check       # Apenas verifica pre-requisitos
/deploy preview     # Deploy para staging
/deploy production  # Deploy para producao
/deploy rollback    # Reverte para versao anterior

/preview start      # Inicia servidor
/preview stop       # Para servidor
/preview check      # Verifica saude

/test               # Roda todos os testes
/test coverage      # Mostra cobertura
/test watch         # Modo watch
```

---

## 5. Skills (Habilidades)

Skills sao **modulos de conhecimento** que os agents carregam sob demanda. Voce NAO invoca skills diretamente - os agents as usam automaticamente.

### Como funciona o carregamento

```
Voce: "@backend-specialist crie uma API REST"
    |
    +-- Agent le seu SKILL.md
    +-- Agent ve que precisa de: api-patterns, nodejs-best-practices
    +-- Agent carrega SKILL.md de cada skill necessaria
    +-- Agent aplica os principios ao criar a API
```

### Regra de Ouro: Selective Reading

**Nao leia todos os arquivos de uma skill.** O fluxo correto:

1. Leia o `SKILL.md` (e o indice)
2. Identifique as secoes relevantes
3. Leia APENAS essas secoes

### Lista Completa de Skills

#### Frontend & UI
| Skill | O que ensina |
|-------|-------------|
| `react-patterns` | Hooks, estado, performance React |
| `nextjs-best-practices` | App Router, Server Components |
| `tailwind-patterns` | Utilitarios Tailwind CSS v4 |
| `frontend-design` | Padroes UI/UX, design systems |

#### Backend & API
| Skill | O que ensina |
|-------|-------------|
| `api-patterns` | REST, GraphQL, tRPC |
| `nodejs-best-practices` | Async, modulos Node.js |
| `python-patterns` | Padroes Python, FastAPI |

#### Banco de Dados
| Skill | O que ensina |
|-------|-------------|
| `database-design` | Schema, otimizacao, migracoes |

#### Infraestrutura
| Skill | O que ensina |
|-------|-------------|
| `deployment-procedures` | CI/CD, workflows de deploy |
| `server-management` | Gestao de infraestrutura |

#### Testes & Qualidade
| Skill | O que ensina |
|-------|-------------|
| `testing-patterns` | Jest, Vitest, estrategias |
| `webapp-testing` | E2E, Playwright |
| `tdd-workflow` | Desenvolvimento guiado por testes |
| `code-review-checklist` | Padroes de code review |
| `lint-and-validate` | Linting, validacao |

#### Seguranca
| Skill | O que ensina |
|-------|-------------|
| `vulnerability-scanner` | Auditoria de seguranca, OWASP |
| `red-team-tactics` | Seguranca ofensiva |

#### Arquitetura & Planejamento
| Skill | O que ensina |
|-------|-------------|
| `app-builder` | Scaffolding full-stack |
| `architecture` | Padroes de design de sistema |
| `plan-writing` | Formato de planos de tarefa |
| `brainstorming` | Perguntas socraticas |

#### Mobile
| Skill | O que ensina |
|-------|-------------|
| `mobile-design` | Padroes UI/UX mobile |

#### Game Development
| Skill | O que ensina |
|-------|-------------|
| `game-development` | Logica de jogos (com sub-skills) |

#### SEO & Crescimento
| Skill | O que ensina |
|-------|-------------|
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | Otimizacao para GenAI |

#### Shell/CLI
| Skill | O que ensina |
|-------|-------------|
| `bash-linux` | Comandos Linux, scripting |
| `powershell-windows` | PowerShell Windows |

#### Outras
| Skill | O que ensina |
|-------|-------------|
| `clean-code` | Padroes de codigo limpo (GLOBAL) |
| `behavioral-modes` | Modos de comportamento |
| `parallel-agents` | Padroes multi-agente |
| `mcp-builder` | Model Context Protocol |
| `documentation-templates` | Formatos de documentacao |
| `i18n-localization` | Internacionalizacao |
| `performance-profiling` | Web Vitals, otimizacao |
| `systematic-debugging` | Solucao de problemas |

---

## 6. INSTRUCTIONS.md (Regras Globais)

Este arquivo e **SEMPRE carregado** quando o OpenCode inicia. Contem as regras que se aplicam a todas as sessoes.

### Principais Regras

| Regra | Descricao |
|-------|-----------|
| **Socratic Gate** | Para pedidos complexos, PERGUNTE antes de implementar |
| **Clean Code** | Todo codigo deve seguir padroes do skill `clean-code` |
| **Selective Reading** | Nao leia tudo - leia o necessario |
| **Path Awareness** | Agentes em `.opencode/agents/`, skills em `.opencode/skills/` |
| **Read -> Understand -> Apply** | Nao copie padroes - entenda OS PRINCIPIOS |

### Hierarquia de Prioridade

```
P0: INSTRUCTIONS.md (regras globais)
    |
P1: Agent .md (regras do agent especifico)
    |
P2: SKILL.md (regras da skill especifica)
```

---

## 7. ARCHITECTURE.md (Referencia)

O `ARCHITECTURE.md` e uma **referencia rapida** do sistema. Leia quando precisar lembrar:

- Quantos agents, skills e commands existem
- Qual agent usar para cada necessidade
- Quais skills estao disponiveis
- Como invocar scripts de validacao

**Use como indice:** Se nao sabe qual agent usar, consulte a tabela em ARCHITECTURE.md.

---

## 8. Scripts de Validacao

### checklist.py (Validacao Priorizada)

```bash
# Rodar durante o desenvolvimento
python .opencode/scripts/checklist.py .

# Rodar com URL para checar performance
python .opencode/scripts/checklist.py . --url http://localhost:3000
```

**O que verifica (em ordem de prioridade):**
1. Seguranca (vulnerabilidades, secrets)
2. Codigo (lint, tipos)
3. Schema (validacao)
4. Testes (suite)
5. UX (auditoria)
6. SEO (verificacao)

### verify_all.py (Verificacao Completa)

```bash
# Verificacao completa pre-deploy
python .opencode/scripts/verify_all.py . --url http://localhost:3000
```

**Inclui TUDO do checklist.py MAIS:**
- Lighthouse (Core Web Vitals)
- Playwright E2E
- Analise de bundle
- Auditoria mobile
- Verificacao i18n

### Scripts por Skill

Cada skill tem seus proprios scripts em `scripts/`:

| Script | Skill | Quando usar |
|--------|-------|-------------|
| `security_scan.py` | vulnerability-scanner | Sempre no deploy |
| `lint_runner.py` | lint-and-validate | Toda mudanca de codigo |
| `test_runner.py` | testing-patterns | Apos mudanca de logica |
| `schema_validator.py` | database-design | Apos mudanca de DB |
| `ux_audit.py` | frontend-design | Apos mudanca de UI |
| `accessibility_checker.py` | frontend-design | Apos mudanca de UI |
| `seo_checker.py` | seo-fundamentals | Apos mudanca de pagina |
| `mobile_audit.py` | mobile-design | Apos mudanca mobile |
| `lighthouse_audit.py` | performance-profiling | Antes do deploy |
| `playwright_runner.py` | webapp-testing | Antes do deploy |

---

## 9. Exemplos Praticos

### Cenario 1: Criar uma Nova Feature

```
Voce: /create pagina de checkout

O que acontece:
1. Comando /create analisa o pedido
2. Pergunta: "Qual framework? Qual estilo?"
3. Coordena agentes:
   - @database-architect -> Schema do pedido
   - @backend-specialist -> API de checkout
   - @frontend-specialist -> UI do checkout
4. Aplica clean-code e testes
5. Roda checklist.py para validar
```

### Cenario 2: Debugar um Bug

```
Voce: /debug formulario de login nao envia dados

O que acontece:
1. Comando /debug coleta informacoes
2. Pergunta: "Qual erro? Como reproduzir?"
3. Formula hipoteses (ordenadas por probabilidade)
4. Testa cada hipoteses sistematicamente
5. Aplica fix e explica a causa raiz
6. Adiciona medidas de prevencao
```

### Cenario 3: Revisar Codigo

```
Voce: @security-auditor audite o endpoint /api/auth

O que acontece:
1. Agent le SKILL.md de vulnerability-scanner
2. Analisa o endpoint para:
   - Injecao SQL
   - XSS
   - Broken authentication
   - Rate limiting
   - Secrets hardcoded
3. Gera relatorio com severidades
4. Sugere fixes especificos
```

### Cenario 4: Otimizar Performance

```
Voce: /ui-ux-pro-max landing page para restaurante

O que acontece:
1. Analisa requisitos (tipo, industria, keywords)
2. Gera design system completo:
   - Estilo visual
   - Paleta de cores
   - Tipografia
   - Efeitos e animacoes
3. Busca guias de implementacao
4. Retorna recomendacoes especificas
```

### Cenario 5: Deploy Seguro

```
Voce: /deploy production

O que acontece:
1. Roda pre-flight checks:
   - TypeScript sem erros?
   - ESLint passando?
   - Testes OK?
   - Secrets seguros?
   - Bundle size aceitavel?
2. Se tudo OK -> build + deploy
3. Verifica health check apos deploy
4. Gera relatorio de deploy
5. Se falhar -> sugere rollback
```

### Cenario 6: Coordenar Multi-Agentes

```
Voce: /orchestrate refatorar modulo de pagamentos

O que acontece:
1. Analisa dominios: Backend, Security, Testing
2. FASE 1 (Planejamento):
   - @project-planner cria docs/PLAN.md
   - Pede aprovacao do usuario
3. FASE 2 (Apos aprovacao):
   - @database-architect refatora schema
   - @backend-specialist refatora API
   - @security-auditor audita mudancas
   - @test-engineer valida com testes
4. Gera relatorio consolidado
```

---

## 10. Personalizacao

### Adicionar um Novo Agent

Crie um arquivo `.md` em `.opencode/agents/`:

```markdown
---
description: Meu agent personalizado para X
mode: subagent
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Meu Agent

Voce e um especialista em [dominio].

## Suas Responsabilidades
- [Responsabilidade 1]
- [Responsabilidade 2]

## Regras
- [Regra 1]
- [Regra 2]
```

**O nome do arquivo = nome do agent:** `meu-agent.md` -> `@meu-agent`

### Adicionar um Novo Comando

Crie um arquivo `.md` em `.opencode/commands/`:

```markdown
---
description: Meu comando para fazer Y
---

# /meu-comando

$ARGUMENTS

## Tarefa
1. [Passo 1]
2. [Passo 2]
3. [Passo 3]
```

**Use `$ARGUMENTS`** para pegar o texto apos o comando.

### Adicionar uma Nova Skill

Crie uma pasta em `.opencode/skills/` com um `SKILL.md`:

```
.opencode/skills/minha-skill/
    SKILL.md
    scripts/        # opcional
    references/     # opcional
```

O `SKILL.md` deve ter:

```markdown
---
name: minha-skill
description: O que esta skill ensina (max 1024 chars)
---

# Minha Skill

## Conteudo
[Instrucoes detalhadas]

## Script
| Script | Comando |
|--------|---------|
| `scripts/meu-script.py` | `python .opencode/skills/minha-skill/scripts/meu-script.py .` |
```

**Regras para skills:**
- `name` deve ser igual ao nome da pasta
- `name`: minusculas, hifens, 1-64 caracteres
- `description`: obrigatorio, max 1024 caracteres

---

## 11. Dicas e Best Practices

### Use a Hierarquia Correta

```
INSTRUCTIONS.md (sempre ativo)
    -> Agent (regras do especialista)
        -> Skill (conhecimento especifico)
```

**Nao pule niveis.** Se o INSTRUCTIONS.md diz algo, vale para todos.

### Selective Reading e Obrigatorio

```
ERRADO: Ler todos os 30 arquivos da skill api-patterns
CORRETO: Ler SKILL.md -> Identificar secao relevante -> Ler 1-2 arquivos
```

### Socratic Gate Nao e Opcional

Para pedidos complexos, **SEMPRE pergunte antes de implementar**:

```
ERRADO: "Vou criar um sistema de auth completo"
CORRETO: "Antes de comecar: JWT ou session? OAuth necessario? qual DB?"
```

### Agents Trabalham Melhor Juntos

Para tarefas complexas, use `/orchestrate` que coordena 3+ agentes:

```
ERRADO: "@frontend-specialist crie API + UI + testes"
CORRETO: "/orchestrate criar modulo de pagamentos"
         (que usa @backend-specialist + @frontend-specialist + @test-engineer)
```

### Roda Validacao Regularmente

```bash
# Durante o desenvolvimento (rapido)
python .opencode/scripts/checklist.py .

# Antes do deploy (completo)
python .opencode/scripts/checklist.py . --url http://localhost:3000

# Pre-release (tudo)
python .opencode/scripts/verify_all.py . --url http://localhost:3000
```

### Referencia Rapida

| Precisa de... | Use... |
|---------------|--------|
| Criar algo do zero | `/create` |
| Melhorar algo existente | `/enhance` |
| Entender um bug | `/debug` |
| Planejar sem codar | `/plan` |
| Explorar ideias | `/brainstorm` |
| Revisar seguranca | `@security-auditor` |
| Revisar performance | `@performance-optimizer` |
| Design/UI | `/ui-ux-pro-max` |
| Deploy | `/deploy` |
| Testes | `/test` |
| Coordenar agentes | `/orchestrate` |
| Status do projeto | `/status` |

---

## Comandos Built-in do OpenCode

Alem dos nossos comandos customizados, o OpenCode tem comandos nativos:

| Comando | Descricao |
|---------|-----------|
| `/init` | Cria ou melhora AGENTS.md do repositorio |
| `/undo` | Desfaz ultima alteracao de arquivos |
| `/redo` | Refaz alteracao desfeita |
| `/share` | Cria link compartilhavel da conversa |
| `/help` | Mostra ajuda |
| `/connect` | Configura provedor de IA |
| `/compact` | Comprime contexto longo |
| `/thinking` | Alterna exibicao do processo de raciocinio |

---

> **Lembre-se:** O `.opencode/` foi criado para voce. Use os agents, commands e skills como ferramentas - nao como restricoes. O objetivo e codigo melhor, mais rapido.
