# Plano de Implementação: Subagent-Driven Development (SDD) no GraficaOS

> **Referência:** Framework de desenvolvimento autônomo baseado em subagentes do [obra/superpowers](https://github.com/obra/superpowers).  
> **Ambiente Alvo:** Monorepo GraficaOS com Antigravity CLI/IDE e kit de agentes `.agents/`.

---

## 1. Visão Geral e Contexto

No framework **Superpowers** (`obra/superpowers`), o **Subagent-Driven Development (SDD)** é uma metodologia de engenharia de software desenhada especificamente para agentes de IA codificadores. O princípio central é:

> **Subagente fresco por tarefa + Revisão em duas fases (Spec Compliance + Code Quality) + Ledger persistente + "Rulings, not stalls" = Alta qualidade, zero degradação de contexto e iteração veloz.**

### Pilares do SDD:
1. **Evita Poluição de Contexto (Context Degradation):** Em vez de um único agente acumular milhares de linhas de contexto e perder o foco ou sofrer alucinações pós-compactação, o orquestrador despacha um subagente isolado (`invoke_subagent`) com prompt cirúrgico e focado apenas na tarefa atual.
2. **Double-Review Obrigatório (Spec + Quality):** Cada tarefa concluída pelo implementador é avaliada por subagentes revisores antes de ser marcada como concluída:
   - **Spec Reviewer:** Garante que o diff (`git diff`) atendeu estritamente à especificação da tarefa, sem faltar requisitos e sem escopo desnecessário (YAGNI).
   - **Code Quality Reviewer:** Avalia padrões de código, convenções do monorepo (P7 PT-BR, .NET 10, zero warnings, testes AAA, sem IO no core).
3. **Ledger Persistente (`progress.md`):** Um arquivo local fora do tracking do git que registra o status de cada tarefa, histórico de tentativas de correção e decisões tomadas (*Rulings*). Se o orquestrador reiniciar ou o contexto for compactado, ele lê o ledger e sabe exatamente onde parou.
4. **"Rulings, not stalls":** Conflitos menores e ambiguidades de especificação são resolvidos e registrados como decisões formais no ledger, evitando que o agente fique parando para perguntar trivialidades ao usuário.

---

## 2. Como Vamos Implementar o SDD no Sistema

O ambiente de execução oficial deste projeto é o **Antigravity** (Google DeepMind) integrado ao monorepo GraficaOS. O Antigravity já oferece primitivas nativas ideais para o SDD:
- `invoke_subagent`: Dispara subagentes (`inherit`, `flash`, `pro`, workspaces isolados `inherit` ou `branch`).
- `define_subagent`: Cria subagentes com restrição de ferramentas (somente leitura para revisores, leitura/escrita para implementadores).
- `run_command`: Executa testes e comandos no PowerShell.

### Arquitetura da Skill SDD no Monorepo
Vamos criar a skill `.agents/skills/subagent-driven-development/` com a seguinte composição:

```text
.agents/skills/subagent-driven-development/
├── SKILL.md                          # Protocolo mestre do orquestrador SDD
├── implementer-prompt.md             # Template de instruções do subagente implementador
├── spec-reviewer-prompt.md           # Template do revisor de conformidade com a especificação
├── code-quality-reviewer-prompt.md   # Template do revisor de qualidade e padrões GraficaOS
├── ledger-template.md                # Molde do arquivo de progresso persistente (progress.md)
└── scripts/
    └── sdd-workspace.ps1             # Utilitário PowerShell para inicializar e gerenciar o workspace SDD
```

---

## 3. Proposta de Feature para Testar o SDD

Para testar o fluxo SDD de ponta a ponta na prática, precisamos de uma feature modular, com dependências claras, que siga TDD estrito e demonstre as etapas de implementação e dupla revisão.

### Opção A (Recomendada): **Gerador de Linha de Informações Técnicas da Imposição (Slugline / Job Slug)**
- **Domínio:** `packages/imposition-core` + `packages/imposition-pdf` + `sidecars/AutoImposerCLI`.
- **Necessidade Real:** Folhas e chapas impressas em gráficas exigem uma marcação de rodapé/cabeçalho fora da área de sangria contendo:
  - Nome do arquivo de trabalho.
  - Data/hora de imposição e dimensões do papel/gabarito.
  - Quantidade total e numeração de folhas/peças.
- **Divisão em Tarefas SDD:**
  1. **Task 1 (Core Puro C# - TDD):** Criar `SluglineCalculator` e modelo de dados em `packages/imposition-core` (cálculo de posicionamento fora da margem da chapa, formatação de texto técnico). 100% testes unitários xUnit com zero IO.
  2. **Task 2 (PDF Layer):** Implementar o renderizador de texto/slugline em `packages/imposition-pdf` via QPDF/QDF/ContentStream preservando OCG.
  3. **Task 3 (CLI Integration):** Expor a opção `--slugline` no `AutoImposerCLI` e validar a geração do PDF final via teste de integração.

### Opção B: **Cálculo e Renderização de Marcas de Registro Duplex (Front/Back Cross-Registration)**
- **Domínio:** `packages/imposition-core` (ADR-022) + `packages/imposition-pdf`.
- **Tarefas:**
  1. Task 1: Cálculo geométrico espelhado das marcas de registro para frente e verso (Head-to-Head / Head-to-Foot).
  2. Task 2: Renderização das cruzetas de registro duplex no PDF imposto.

### Opção C: **Endpoint e Ledger de Auditoria de Imposições no ERP (`grafica-app`)**
- **Domínio:** Backend Node/TS do `grafica-app`.
- **Tarefas:**
  1. Task 1: Schema e repositório de logs de imposição com validação Zod.
  2. Task 2: Endpoint REST com autenticação e paginação.

---

## 4. Plano de Verificação

### Verificação da Infraestrutura SDD:
1. Validar se todos os arquivos da nova skill foram criados com sintaxe e links corretos no `.agents/skills/`.
2. Executar `scripts/sdd-workspace.ps1` para simular a criação de um workspace SDD e verificar a persistência do ledger `progress.md`.

### Verificação da Feature Teste (Execução SDD Real):
1. **Task 1:** Subagente implementa o cálculo da Slugline via TDD em `Imposition.Core`.
   - Execução de `dotnet test packages/imposition-core/tests/Imposition.Core.Tests/` (deve passar 100%).
   - Subagentes revisores avaliam e aprovam com relatório registrado no `progress.md`.
2. **Task 2:** Subagente implementa a camada PDF.
   - Execução dos testes de PDF com validação da saída.
   - Revisores avaliam diff e aprovam.
3. **Task 3:** Integração no CLI e teste ponta a ponta com um comando de imposição real gerando o PDF com a slugline técnica.
4. **Whole-Branch Review:** Subagente final revisa o diff completo da feature na branch.
