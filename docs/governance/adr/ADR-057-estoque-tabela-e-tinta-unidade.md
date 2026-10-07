# ADR-057: Estoque em Tabela Inteligente, Lote de Tinta por Unidade e Desacoplamento de Consumo

> **Status:** Aprovado  
> **Data:** 2026-10-07  
> **Autor:** Felipe / Antigravity  
> **Domínio:** inventory / prepress-ui / deduction / reports  
> **Regras de Negócio:** BR-002, BR-009, BR-011 (Emenda), BR-012 (Emenda), BR-057 (Nova)  
> **Substitui / Complementa:** Complementa ADR-009, ADR-013; reformula decisões de débito fino de ADR-052  

---

## 1. Contexto

Durante os testes de operação gráfica em produção, dois problemas graves emergiram:

1. **Visualização em card não escala:** Com a expansão do catálogo de SKUs, cards ocupam espaço vertical excessivo e forçam o operador a abrir modais de drill-down para descobrir a informação mais vital do dia a dia: **qual lote/bobina está carregado e ativo no momento em cada equipamento**.
2. **Dedução automática de tinta por ml/cc por job é inerentemente imprecisa:** RIPs (HP e Mimaki) reportam volumes estimados que não capturam com fidelidade ciclos automáticos de limpeza, purgas, reimpressões ou flutuações de densidade de perfis de cor. Tentar fechar a contabilidade de estoque subtraindo mililitros a cada job gerou inconsistências de inventário.

Adicionalmente, a rota legada `/automation` (Imposição 70×100) foi descontinuada do Electron, transferindo o fluxo operacional de trabalhos para as telas nativas de Jobs por máquina (`/maquinas/job`).

---

## 2. Decisões

### Decisão 1: Tabela Inteligente (TanStack Table) com Lote Ativo em Destaque
- A tela de estoque substitui os cards por uma **Data Table** com uma linha por SKU do catálogo (`stock_items`).
- A coluna **Lote Ativo** exibe diretamente na linha o identificador curto/serial do ativo em `IN_USE` e o nome da máquina vinculada (ou `— nenhum carregado —`).
- Coluna **Em Espera** exibe a contagem de lotes prontos na prateleira (`NEW`).
- Ordenação por qualquer coluna com foco primário em **Status** (permite trazer `Zerado` e `Baixo` para o topo instantaneamente).
- Filtros combinados em tempo real (Categoria + Status + Máquina), busca instantânea em memória e exportação para CSV sob demanda.
- Agrupamento colapsável por categoria (`PAPER_MEDIA`, `INK_SUPPLY`, `OTHER`).
- Modal de drill-down reorganizado em 3 seções visualmente distintas: **"Em uso"** (topo, destaque), **"Em espera"** (lista normal) e **"Baixados"** (recolhido/secundário).

### Decisão 2: Estoque de Tinta por Unidades Inteiras (`NEW`)
- Cria-se a entidade irmã `tinta_lotes` com ciclo de estados: `NEW` (na prateleira) $\to$ `IN_USE` (carregada na máquina) $\to$ `FINISHED` (baixada/trocada).
- **"Disponível" para um SKU de tinta = contagem de lotes com `state = 'NEW'`.**
- Um lote carregado na máquina em `IN_USE` **sai imediatamente da contagem de disponível**, independente de quanto volume resta dentro dele. Não há campo de `ml_remaining` para fins de inventário.
- Alerta de estoque baixo (`LOW_STOCK`): baseado em contagem de unidades inteiras em `NEW <= minQuantity`.

### Decisão 3: Desacoplamento da Dedução de Tinta dos Agentes HP e Mimaki
- As rotas/agentes HP (`BR-011`) e Mimaki (`BR-012`) continuam calculando o consumo de tinta em ml/cc gerado por cada job, mas **NÃO decrementam mais nenhum saldo de estoque de tinta** nem inserem `stockTransactions` de tinta.
- Esse consumo calculado é gravado na tabela analítica `ink_consumption_log` exclusivamente para emissão de relatórios gerenciais de consumo.
- **Dedução de mídia física (bobina em metros lineares) permanece 100% inalterada.**

### Decisão 4: Quick Switch de Tinta na Máquina
- Replicado o padrão do Quick Switch da bobina (ADR-013) para tintas via endpoint `POST /api/machines/:id/active-tinta`.
- Ao carregar um novo lote: o lote anterior naquele canal (se houver) passa para `FINISHED` (`location = 'discarded'`), e o novo lote passa para `IN_USE` (`location = 'machine:<id>'`).
- Operação atômica em menos de 1 segundo, sem burocracia ou bloqueio de produção.

---

## 3. Consequências e Invariantes

- A verdade do estoque físico de tintas é rastreada por frascos/cartuchos lacrados na prateleira.
- O histórico de consumo em ml reflete a telemetria reportada pelos RIPs sem gerar discrepâncias no almoxarifado.
- A tela de estoque ganha alta densidade de informação e velocidade de consulta para o operador.
