# Design Doc: Estoque em Tabela + Lote Ativo + Tinta por Unidade e Desacoplamento de Automação

> **Data:** 2026-10-07  
> **Status:** Aprovado  
> **Autores:** Antigravity / Felipe  
> **Branch Alvo:** `feature/estoque-tabela-tinta-unidade`  
> **Regras Afetadas:** BR-002, BR-009, BR-011 (Emenda), BR-012 (Emenda), Nova Regra de UI de Estoque  
> **ADRs Relacionadas:** ADR-009, ADR-013, ADR-052, ADR-056 (Nova)  

---

## 1. Contexto e Motivação

Durante os testes de produção do GraficaOS, dois problemas operacionais críticos foram identificados:

1. **Visualização em Cards Inadequada:** A exibição de itens de estoque em grade de cartões não escala com o crescimento do catálogo de SKUs e esconde a informação mais crítica para o operador de produção (qual lote/bobina está ativo no momento na máquina) atrás de cliques em modais.
2. **Dedução Automática de Tinta por ml/cc por Job:** Gerou divergências contábeis e bugs operacionais, pois os dados reportados por RIPs (HP e Mimaki) são inerentemente aproximados (variações de perfis ICC, limpezas automáticas de cabeçote, reimpressões e purgas).
3. **Página Legada de Automação:** A página `/automation` (Imposição 70×100) foi descontinuada e não será utilizada no Electron, com a operação sendo orientada pelas telas nativas de Jobs por máquina (`/maquinas/job`).

### Decisão Principal
- **Desacoplar o relatório de consumo (ml/cc por job) da contagem de estoque (unidades inteiras).**
- O estoque de tinta passa a ser gerenciado exclusivamente por **contagem de unidades físicas inteiras** (garrafas/cartuchos/toners em estado `NEW`).
- A unidade em uso (`IN_USE`) sai imediatamente da contagem de disponível assim que carregada na máquina, independente do volume interno restante.
- A grade de cartões é substituída por uma **Tabela Inteligente** com **TanStack Table**, exibindo lote ativo em destaque e permitindo filtros combinados, busca instantânea, ordenação por status e exportação.

---

## 2. Escopo de Mudanças

### 2.1 Limpeza e Desacoplamento da Automação (Next.js + Electron)
- **Frontend (`grafica-app`):**
  - Excluir o diretório e rota da página `src/app/(dashboard)/automation/page.tsx`.
  - Remover a query `src/lib/queries/automation.ts`.
  - Remover o item de navegação `"Imposição 70×100"` (`href: '/automation'`) em `src/components/navigation/sidebar-rail.tsx`.
  - Limpar imports residuais em modais ou componentes compartilhados.
- **Electron (`electron`):**
  - Remover a exposição de `window.grafica.automation` em `electron/preload.js`.
  - Remover os IPC handlers `automation:impose` e `automation:pick-art` no processo principal do Electron.

---

### 2.2 Modelo de Dados e Banco de Dados (Drizzle / SQLite)

#### Entidade Irmã: `tinta_lotes`
Dedicada a gerenciar unidades individuais de tintas, vernizes e solventes:
- `id`: `text` (PK)
- `stock_item_id`: `text` (FK `stock_items.id`, cascade)
- `serial`: `text` (identificador físico, lote do fabricante ou código curto)
- `state`: `text` enum (`'NEW'`, `'IN_USE'`, `'FINISHED'`), default `'NEW'`
- `location`: `text` (`'deposito'`, `'machine:<id>'`, `'discarded'`), default `'deposito'`
- `machine_id`: `text` (FK `machines.id`, nullable)
- `channel`: `text` (ex: `Cyan`, `Magenta`, `Yellow`, `Black`, `White1`, `White2`, `Varnish`, `Optimizer`)
- `opened_at`: `integer` (timestamp, nullable)
- `finished_at`: `integer` (timestamp, nullable)
- `created_at`: `integer` (timestamp)
- **Índice Único Parcial:** `UNIQUE(machine_id, channel)` onde `state = 'IN_USE'` (garante no máximo 1 lote ativo por canal em cada equipamento).

#### Entidade de Histórico: `ink_consumption_log`
Dedicada exclusivamente ao registro analítico de consumo por job:
- `id`: `text` (PK)
- `job_id`: `text` (nullable)
- `machine_id`: `text` (FK `machines.id`)
- `channel`: `text`
- `ml_consumed`: `real`
- `created_at`: `integer` (timestamp)

---

### 2.3 Regras de Negócio e Agentes de Dedução

#### 1. Saldo Disponível de Tinta por Unidade
- Para qualquer item com `category = 'INK_SUPPLY'`, o saldo disponível (`currentQuantity`) passa a ser estritamente:
  $$\text{Disponível} = \text{COUNT}(\text{tinta\_lotes onde } state = 'NEW' \text{ e } location = 'deposito')$$
- Um lote com `state = 'IN_USE'` sai imediatamente do saldo disponível.
- Alerta de estoque baixo (`LOW_STOCK`): disparado quando $\text{Disponível} \le stock\_items.minQuantity$.

#### 2. Desacoplamento dos Agentes HP Latex e Mimaki
- **HP Latex 330 (`BR-011` reformulada):**
  - Dedução de mídia/bobina linear permanece **100% inalterada**.
  - No processamento de jobs, a dedução automática em `stock_items.currentQuantity` e a inserção de `stockTransactions` de tinta são **removidas**.
  - O agente continua calculando os ml consumidos por canal e grava uma linha por canal em `ink_consumption_log`.
- **Mimaki (`BR-012` reformulada):**
  - Dedução de substrato em bobina permanece **100% inalterada**.
  - A dedução de tinta UV em `garrafas` ou `stock_items` é **removida**.
  - O agente insere os registros em `ink_consumption_log` para fins de relatório.

#### 3. Quick Switch de Tinta (ADR-013 Estendida)
- Endpoint rápido: `POST /api/machines/:id/active-tinta`
  - Payload: `{ channel: string, newLoteId: string }`
  - Transação:
    1. Se houver lote `IN_USE` no canal da máquina, ele é atualizado para `state = 'FINISHED'`, `location = 'discarded'` e `finishedAt = now()`.
    2. O novo lote é atualizado para `state = 'IN_USE'`, `location = 'machine:<id>'`, `machineId = id` e `openedAt = now()`.
    3. Emite evento Socket.IO `stock:updated`.
  - Execução imediata sem burocracia ou fluxos de aprovação adicionais.

---

### 2.4 Interface do Usuário: Tabela Inteligente TanStack Table

#### Componente: `StockDataTable`
Implementado com `@tanstack/react-table` e componentes shadcn/ui.

- **Colunas:**
  1. `select`: Checkbox de seleção por linha e no cabeçalho.
  2. `product`: Nome do produto, código interno e largura (se bobina).
  3. `activeLot`: Badge com ID curto/serial + máquina onde está rodando (ex.: `[#L-102 • Mimaki UV]`). Se não houver lote ativo, exibe `— nenhum carregado —`.
  4. `availableLots`: Contagem de lotes prontos na prateleira (`NEW`).
  5. `totalQuantity`: Saldo total de ativos ou quantidade registrada.
  6. `status`: Badge visual (`Disponível` [verde], `Baixo` [amarelo], `Zerado` [vermelho/rosa]).
  7. `actions`: Botão `"Ver Lotes"` (abre modal de drill-down), adicionar lote e lançamentos manuais.
- **Ordenação:** Ordenação de colunas com prioridade para `Status`, permitindo visualizar itens `Zerado` e `Baixo` no topo imediatamente.
- **Filtros Combinados:** Seletores simultâneos de Categoria (`PAPER_MEDIA`, `INK_SUPPLY`, `OTHER`), Status e Máquina.
- **Busca Instantânea:** Filtro client-side por nome, código ou serial sem round-trip ao backend.
- **Ações em Lote:** Barra de ações ao selecionar linhas, permitindo exportar para CSV.
- **Sincronização em Tempo Real:** Escuta do evento Socket.IO `stock:updated` para invalidar caches do TanStack Query e atualizar a tabela ao vivo.
- **Agrupamento Colapsável:** Seções colapsáveis por categoria (`Mídias`, `Tintas`, `Outros`).
- **Unificação com `/tintas`:** A página `/tintas` consome o mesmo componente `StockDataTable` pré-filtrado para `INK_SUPPLY`.

#### Modal de Drill-Down Reorganizado
O modal "Ver Lotes" passa a apresentar 3 seções visualmente distintas:
1. **Em Uso (Destaque Topo):** Card visual destacando o lote ativo na máquina, canal, data de carregamento e ação de troca rápida.
2. **Em Espera (Lista Principal):** Lista de lotes disponíveis (`NEW`) na prateleira com identificadores e botão de carregamento.
3. **Baixados / Finalizados (Recolhido):** Histórico recolhível com lotes descartados/usados (`FINISHED`).

---

### 2.5 Relatório de Consumo (Tarefa 3)
- Endpoint: `GET /api/reports/consumption` atualizado para ler os dados de `ink_consumption_log`.
- Interface `/relatorios`: seção simplificada com totais agregados de ml consumidos por máquina, canal e mês.

---

## 3. Governança e Regras do Monorepo

1. **Git Flow (P11):** Trabalho realizado na branch `feature/estoque-tabela-tinta-unidade`.
2. **ADR-056:** Criação do documento formal de decisão arquitetural.
3. **Regra R-009:** Atualização estritamente aditiva de `docs/governance/ADR_INDEX.md` sem reescrita destrutiva de bytes.
4. **Atualização de Regras:** Registro de emenda a `BR-011` e `BR-012` em `docs/business/BUSINESS_RULES.md` e `RULE_CHANGELOG.md`.

---

## 4. Estratégia de Verificação e Testes

- **Testes Automatizados (Backend):**
  - Validação do cálculo de saldo derivado baseado em `NEW`.
  - Verificação de que agentes HP e Mimaki geram log em `ink_consumption_log` e não realizam decremento em `stock_items`.
  - Verificação da transação de Quick Switch de tinta.
- **Verificação de Frontend:**
  - `npm run build` em `grafica-app` sem erros de compilação ou tipagem.
  - Verificação dos filtros, ordenação e exportação CSV da TanStack Table.
