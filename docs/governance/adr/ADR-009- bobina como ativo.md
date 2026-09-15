# ADR-009 — Bobina como Ativo Rastreável Individual

- **Status:** Proposto
- **Data:** 2026-09-12
- **Owner:** Felipe
- **Domínio:** inventory / vision
- **Links:** cita **BR-002**, **BR-018**, **BR-019**, **BR-021**; afeta arquivos: `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/src/routes/stock.ts` (`add-roll`, `stock-transactions`), agentes HP/Konica, `grafica-app/backend/src/routes/mimaki.ts`
- **Base conceitual:** `business/DOMAIN_MODEL.md §2` (modelo target), `docs/ESTOQUE-LOGICA-ALGORITMO.md` (agora em `_archive/`)

## Contexto

Hoje (BR-001, `IMPLEMENTED`) o estoque é gerenciado como **quantidade agregada por SKU**: uma linha em `stock_items` representa a soma de todo material daquele tipo. Isso quebra em três pontos práticos observados na operação real:

1. **Perda de identidade física** — duas bobinas de 50m do mesmo material viram uma única linha de "100m disponível". Não há como saber que são duas peças físicas distintas.
2. **Sem visibilidade de qual está em uso** — não é possível responder "a bobina que está rodando na máquina 2 agora tem quantos metros restantes?" nem "tem outra bobina desse material disponível no estoque caso essa acabe no meio do job?".
3. **Fluxo de entrada confuso** — `add-roll` (`stock.ts:289-333`) já duplica o saldo do rolo pra dentro do agregado, mas sem registrar a bobina como unidade própria nem gerar transação IN — é um "meio-termo" que não resolve o problema de origem.

O ganho de rastrear por bobina não é cosmético: é o que permite decisão operacional em tempo real (repor a tempo, saber qual rolo priorizar, auditar consumo por rolo específico) em vez de só saber "quanto sobrou no total".

## Decisão

Adotar o modelo **bobina como ativo rastreável individual**, com `StockItem` (catálogo/SKU) permanecendo como a "família" do material, e uma nova entidade `Bobina` (ativo físico) vinculada 1:N a ela:

```
Bobina
  id (uuid ou serial/barcode)
  stock_item_id  FK
  serial / codigo_barras
  width_mm / meters_initial / meters_remaining
  state: NEW | IN_USE | USED | BLOCKED | SCRAPPED
  location: deposito | machine:<id> | cliente | sucata
  bobina_opened_at / finished_at
```

`StockItem.currentQuantity` deixa de ser uma coluna gravada e passa a ser **derivado**: `Σ meters_remaining` das bobinas em estado `NEW`/`IN_USE` daquele SKU. A dedução de um job passa a escolher **qual bobina específica** consumir (política FIFO por localização/máquina vinculada — a política exata de escolha fica para RFC própria de implementação), decrementando `meters_remaining` daquela bobina, não mais um agregado cego.

Isso não substitui o ledger de auditoria (`stock_transactions`, BR-005) — complementa: cada consumo de bobina também gera sua entrada no ledger, agora referenciando `bobina_id` além de `item_id`.

## Consequências

- **Positivas:**
  - Responde diretamente as perguntas operacionais que hoje não têm resposta ("qual bobina está acabando", "tem outra no estoque").
  - Base necessária para BR-021 (config por empresa) não hard-codar convenção de rolo por gráfica.
  - Abre caminho natural para RFID/barcode físico (fase M5, fora de escopo desta ADR).
- **Negativas:**
  - Refactor de schema não-trivial: `stock_items` deixa de ser fonte de verdade de quantidade; todos os 3 agentes (HP/Konica/Mimaki) e a rota manual precisam passar a debitar por bobina, não por item agregado.
  - Aumenta a complexidade de escolha (qual bobina consumir) — decisão de política (FIFO, por localização, por máquina) precisa de RFC própria antes da implementação de M3.
  - Migração de dados existentes (linhas atuais por SKU → bobinas físicas) exige backfill cuidadoso, já que hoje não há identidade de bobina para separar o agregado.
- **Migração:** faseada (M1-M5), conforme `business/DOMAIN_MODEL.md §2`:
  - **M1** — criar entidade `bobinas` + serial/localização/estado; tela "rolos/bobinas" no estoque.
  - **M2** — migrar linha atual por SKU → bobinas físicas (backfill), transações IN de abertura.
  - **M3** — dedução por bobina (FIFO), estados automáticos (`USED` ao zerar, `SCRAPPED` por descarte).
  - **M4** — reconciliação `Σ bobinas = Σ ledger`; relatórios por rolo e por máquina.
  - **M5** — RFID/barcode físico (INT-008).
  - Cada fase acima requer RFC/ADR própria antes de implementação — esta ADR fixa apenas a decisão de modelo, não autoriza execução de M1-M5 sem RFC subsequente.

## BR-021 — Configuração por empresa

Consistente com BR-021 (single deploy por empresa, configuração nunca hard-coded), os
seguintes aspectos do modelo de bobina devem viver em configuração, não em código, para
que um novo deploy de gráfica seja um pacote de config, não um fork:

- **Convenção de ID curto** (formato, prefixo — ex.: `BOB:` vs outro) e o payload do QR.
- **Enum de estados** (`NEW | IN_USE | USED | BLOCKED | SCRAPPED`) — o conjunto padrão é
  este, mas o rótulo exibido na UI deve ser configurável por empresa (idioma/termo
  interno usado pela equipe).
- **Localizações possíveis** (`deposito | machine:<id> | cliente | sucata`) — a lista de
  localizações "fixas" (depósito, sucata) deve ser extensível via config, não uma lista
  fechada no código.
- **Layout de etiqueta** (dimensões, campos exibidos) — ver tarefa de geração de
  etiquetas, que deve ler esse layout de configuração, não hard-codar.

Esta ADR não define o mecanismo de armazenamento dessa configuração (isso é escopo de
uma ADR própria sobre `architecture/SETTINGS_CATALOG.md`) — apenas fixa que estes campos
específicos do modelo de bobina são candidatos a configuração, não a constante de código.

## Verificação

Critério de aceite de M1 (primeira fase, escopo mínimo verificável):
- [ ] Existe tela/endpoint que lista bobinas individuais de um SKU, cada uma com `meters_remaining`, `state`, `location` próprios.
- [ ] `add-roll` passa a criar uma `Bobina` nova (não mais só somar ao agregado) e gera transação IN de abertura vinculada a ela.
- [ ] `StockItem.currentQuantity` exibido na UI é a soma calculada das bobinas ativas, não mais uma coluna editável diretamente.
- [ ] Teste que amarra BR-002 (status `TARGET` → `PARTIAL` só quando M1 estiver coberto por teste, `IMPLEMENTED` apenas ao final de M3, conforme convenção de status deste projeto).
## Emenda 1: Gest�o de Insumos N�o-Rolo (Tintas e Folhas)
- **Data da Emenda:** 2026-09-13
- **Contexto:** Surgiu a d�vida de como seria a entrada e sa�da de materiais fora do escopo da bobina (como INK_SUPPLY e folhas), j� que a UI adotou as bobinas para o restante e escondeu as op��es de "Rolo". Outra d�vida � se rastrearemos cartuchos individuais.
- **Decis�o:** O modelo e algoritmo de bobinas **n�o se aplica** a cartuchos de tinta nem a resmas de papel. 
  - **Dedu��o de Tintas:** Continua operando sobre o agregado \currentQuantity\ do SKU (medido em mililitros), decrescendo fra��es consumidas via telemetria das m�quinas (HP/Mimaki). N�o cadastramos cartuchos f�sicos como entidades (Asset) individuais.
  - **Carregamento de Estoque (Tintas e Folhas):** A entrada e sa�da avulsa destes itens ocorre atrav�s de transa��es padr�o no ledger (tipo \IN\, \OUT\ e \ADJUSTMENT\), que somam ou subtraem diretamente o campo \currentQuantity\ do \StockItem\. A interface deve prover um formul�rio gen�rico de "Lan�amento Manual" (Adicionar/Remover quantidade) para itens que n�o s�o rastreados como ativos f�sicos.
## Emenda 2: Atalho F2 — Seleção Rápida de Mídia na Página da Máquina
- **Data da Emenda:** 2026-09-14
- **Contexto:** O operador, ao carregar uma mídia na máquina, precisa selecionar rapidamente o material correto pelo código curto que vê na etiqueta/bobina ou pelo nome. Hoje a troca de bobina exige digitar o serial manualmente em um campo sem retorno visual, e não há uma busca unificada por código ou nome na página do canal da máquina.
- **Decisão:** Na página do canal da máquina (`/maquinas?id=X`), o atalho **F2** abre um modal de **seleção de mídia** com busca incremental. Conforme o operador digita, a lista filtra em tempo real:
  - Digitando o **código** curto (`StockItem.code`) → mostra as mídias correspondentes.
  - Digitando o **nome** da mídia (`StockItem.name`) → mostra as correspondentes.
  - Caso não haja mídia correspondente, o modal permite cadastrar uma nova e vincular.
- **Escopo:** Comportamento de UI do canal da máquina. Não altera o modelo de dados nem a lógica de débito. O `onSelect` resolve a mídia escolhida; a integração com o fluxo de check-in de bobina (vincular bobina específica à máquina) é evolução posterior e pode ser coberta por RFC própria.
- **Status:** Aceita como comportamento padrão do canal da máquina.

## Emenda 3: Garrafas de Tinta como Ativos Físicos (Mimaki 1000ml)
- **Data da Emenda:** 2026-09-14
- **Contexto:** A Emenda 1 definiu as tintas como agregado (não rastreável por frasco). Na operação real da Mimaki UV (Core 1000ml por garrafa), o operador confirmou que precisa rastrear cada garrafa individualmente — qual frasco está em uso na máquina, quanto resta, e dar baixa específica por serial (ex.: `TIN-1234`). A mesma mecânica das bobinas se aplica: fonte de verdade passa a ser a garrafa física, não o campo agregado.
- **Decisão:** Cria-se a entidade `garrafas` (tabela própria), espelhando o modelo das `bobinas`:
  - Campos: `stockItemId` (FK p/ `stock_items` INK_SUPPLY), `serial` (gerado `TIN-XXXX` na abertura), `mlInitial`/`mlRemaining`, `state` (`NEW | IN_USE | USED | BLOCKED | SCRAPPED`), `location` (`deposito | machine:<id> | cliente | discarded`), `garrafaOpenedAt`, `finishedAt`, `createdAt`.
  - **Abertura de garrafa** (`add-garrafa`, padrão 1000ml) cria a garrafa e registra a transação IN correspondente — não soma mais direto no agregado.
  - **Débito de tinta da Mimaki:** decrementa `mlRemaining` da garrafa `IN_USE` na máquina (`location = machine:<id>`). Ao zerar, marca `USED`. Se não houver garrafa ativa, cai no débito agregado (compatibilidade retroativa).
  - **Tarxeta/estoque:** `currentQuantity` de INK_SUPPLY na UI é a soma calculada das garrafas ativas (`NEW` + `IN_USE`), igual à soma de metros das bobinas. Itens sem garrafa seguem usando o valor agregado da coluna.
  - **Troca de garrafa na máquina:** rota `POST /api/machines/:id/active-garrafa` (idêntica à `active-bobina`), com ação da garrafa anterior (`FINISHED` descarta/`RETURN_TO_STOCK` volta ao depósito), escopada ao mesmo `stockItemId`.
- **Escopo:** Aplica-se às tintas da Mimaki (INK_SUPPLY). Não altera o modelo de papel/folhas (resmas seguem como agregado, conforme Emenda 1).
- **Status:** Aceita — substitui parcialmente a Emenda 1 para tintas INK_SUPPLY.
