# ADR-014 — Padronização de Etiquetas Físicas (106x35mm), Imposição para Konica e Vínculo de Mídia via Electron Quick-Switch

- **Status:** Aprovado
- **Data:** 2026-09-14
- **Owner:** Felipe Neneu
- **Domínio:** inventory | machines | deduction
- **Links:** cita `BR-002`, `BR-010`, `BR-021`; complementa `ADR-009`, `ADR-013`; afeta arquivos: `backend/src/agents/hp-latex/stock-deductor.ts`, `backend/src/routes/mimaki.ts`, `frontend/src/modules/inventory/components/LabelImposition.tsx`, `electron/src/renderer/components/QuickSwitchBar.tsx`
- **Base conceitual:** Módulo M1 (Bobina como Ativo), Módulo M3 (Identificação e Dedução Automática), Padrão de imposição gráfica SRA3 (330x480mm) para produção sob demanda

## Contexto

Com a aprovação do modelo de ativos individuais (ADR-009), o sistema precisa rastrear unidades físicas de bobinas contínuas e tintas (litros/bags). As impressoras HP Latex e Mimaki não identificam automaticamente os rolos carregados.

Para viabilizar o débito automático (M3) sem custo de aquisição inicial de coletores de dados ou impressoras térmicas dedicadas:

- **Padronização física:** As etiquetas de identificação devem servir tanto para bobinas (coladas no miolo/tubete) quanto para bags/frascos de tinta, possuindo dimensões compatíveis com o espaço físico desses insumos.
- **Produção interna na Konica:** A produção das etiquetas será feita em folhas autoadesivas no formato padrão da máquina (330 × 480 mm), exigindo aproveitamento de chapa com margem de segurança de 5 mm, espaçamento entre etiquetas de 3 mm e borda preta externa contínua para guilhotina ou meio-corte.
- **Ergonomia do chão de fábrica:** O operador da Mimaki realiza a montagem física da bobina e obrigatoriamente se desloca até o computador para preparar os arquivos no RasterLink (RIP). Esse comportamento permite criar um atalho no Electron que reduz o tempo de apontamento a menos de 2 segundos, eliminando a dependência obrigatória de scanners ou smartphones durante a rotina produtiva.

## Decisão

Adotar a etiqueta física unificada de 106 × 35 mm para bobinas e tintas (QR Code à esquerda com payload semântico compacto, dados legíveis à direita e contorno preto de 1pt para corte). A geração e o cálculo de imposição gráfica serão executados **100% no client-side** (React/Electron via `pdf-lib` e `qrcode`) no formato de folha 330 × 480 mm com suporte a rotação dinâmica (0° e 90°) e gap de 3 mm. O vínculo operacional no terminal Electron dar-se-á prioritariamente via **Quick Switch por teclado (`F2`)** com resolução automática de códigos digitados e política de confirmação rápida para transferências entre máquinas.

### Detalhamento da Decisão

#### 1. Especificação da Etiqueta Unificada (Bobinas e Tintas)
- **Dimensões:** 106 mm (largura) × 35 mm (altura).
- **Borda de corte:** Fio preto contínuo de 1pt circundando cada etiqueta como guia para guilhotina manual ou meio-corte.
- **Layout visual:**
  - **Lado Esquerdo:** QR Code compacto contendo o payload semântico estruturado:
    - Bobinas: `BOB:1042`
    - Tintas/Bags: `TNK:502`
  - **Lado Direito:** Identificador curto legível em destaque negrito (`#1042`), descrição do material/cor, lote e quantidade/metragem nominal.
- **Evolução futura de hardware:** O leitor de código de barras/câmera física será plugado como evolução futura quando os leitores estiverem disponíveis na bancada; no presente, o fluxo padrão de chão de fábrica opera diretamente via código.

#### 2. Módulo de Imposição e Pré-visualização (Client-Side)
- **Arquitetura 100% Client-Side:** Execução no frontend React/Electron utilizando `pdf-lib` e `qrcode`, sem sobrecarga de CPU ou roundtrips no backend Fastify.
- **Área de impressão:** Folha 330 × 480 mm com margem de segurança perimetral de 5 mm (área útil: 320 × 470 mm).
- **Espaçamento entre etiquetas (Gap):** 3 mm vertical e horizontal.
- **Algoritmo de rotação e aproveitamento:**
  - **Orientação padrão (0°):** 2 colunas × 12 linhas = 24 etiquetas/folha.
  - **Orientação rotacionada (90°):** 8 colunas × 4 linhas = 32 etiquetas/folha (+33% de aproveitamento de mídia).
- **Interação:** O operador seleciona os insumos recém-cadastrados, visualiza o espelho de montagem em tempo real na tela, alterna rotação e envia diretamente para o diálogo nativo de impressão do Windows direcionado à Konica.

#### 3. Vínculo Operacional no Terminal Electron (Quick-Switch `F2`)
- **Barra de status fixa:** No Electron client de cada máquina (ex: canal `#Mimaki`), exibe o ativo em uso:
  `🟢 Mimaki: Vinil Brilho 1.06m (#1038) — Restante: 18.4m [Trocar Bobina (F2)]`
- **Atalho global `F2`:** Abre modal com foco imediato no campo de busca/código.
- **Resolução e normalização automática do input:** O operador digita o código livremente (`BOB-1042`, `BOB:1042` ou apenas `1042`) e pressiona `Enter`. O parser normaliza o ID e busca o ativo imediatamente.
- **Tratamento de conflito entre máquinas (Transferência com Enter 2x):**
  - Se a bobina digitada já constar com status `IN_USE` em outra máquina (ex: estava na Mimaki e foi fisicamente montada na HP Latex), o modal **não bloqueia** o trabalho, mas exibe um aviso claro de segurança:
    > *"Atenção: Bobina #1042 consta como ativa na máquina Mimaki. Pressione Enter para confirmar a transferência."*
  - O operador confirma instantaneamente com um segundo `Enter`, finalizando a troca em ~2 segundos e evitando desvios por erro de digitação de um dígito.

## Consequências

- **Positivas:**
  - **Custo R$ 0,00 de implantação:** Reaproveita as folhas autoadesivas na Konica e os computadores dos operadores sem aquisição prévia de hardware coletor.
  - **Performance e simplicidade:** Motor client-side com feedback visual instantâneo na montagem e zero overhead de servidor.
  - **Eficiência de mídia na Konica:** Acomodação de até 32 etiquetas por folha 330 × 480 mm com rotação a 90°.
  - **Agilidade com segurança:** Digitação direta (`BOB-xxxx` ou `xxxx`) com confirmação de transferência em 2 toques previne erros de digitação sem burocratizar a produção.
- **Negativas:**
  - Exige acabamento manual de corte/meio-corte nas folhas impressas pela Konica.
  - Depende da disciplina operacional do operador acionar o atalho `F2` na troca física (mitigado pelas regras de detecção de jobs órfãos e conciliação cruzada).
- **Migração:**
  - Criar componente de imposição e renderização de PDF no frontend (`LabelImposition.tsx`).
  - Implementar o componente `QuickSwitchBar.tsx` e o listener do atalho global `F2` no Electron.
  - Imprimir o primeiro lote de etiquetas para os rolos físicos atualmente abertos na produção.

## Verificação

- **Gabarito de Imposição:** O PDF gerado na folha 330 × 480 mm deve respeitar rigorosamente a margem externa de 5 mm, os 3 mm de gap entre etiquetas e o contorno de corte preto de 1pt.
- **Aproveitamento 90°:** A rotação a 90° deve renderizar com sucesso a grade de 8 × 4 (32 etiquetas) sem transbordar a área útil da folha.
- **Tempo e Usabilidade do Quick Switch:** A busca e seleção do ativo via atalho `F2` (digitação de `BOB-xxxx` ou `xxxx` + `Enter`) deve ser completada em menos de 2 segundos.
- **Confirmação de Conflito:** Teste de transferência de uma bobina `IN_USE` na Máquina A para a Máquina B deve exibir o prompt de transferência e exigir a confirmação explícita via segundo `Enter` antes de atualizar a localização do ativo.

---

## Emenda 1: Redimensionamento para 90 × 35 mm e Mesa de Imposição estilo Kodak Preps
- **Data da Emenda:** 2026-09-15
- **Contexto:** A dimensão de 106 × 35 mm limitava o aproveitamento a 32 unidades por folha. A padronização da etiqueta para 90 × 35 mm mantém legibilidade integral do código curto e do QR Code, ao mesmo tempo em que eleva a densidade por folha Konica SRA3 para **40 etiquetas** (+11% de economia de autoadesivo) e viabiliza a mesa de imposição profissional com Drag & Drop nativo estilo Kodak Preps.
- **Nova Matemática da Folha (330 × 480 mm | Margem 5 mm | Gap 3 mm):**
  - **Modo Vertical (90°):** 8 colunas × 5 linhas = **40 etiquetas por folha** (Largura útil: $8 \times 35 + 7 \times 3 = 301 \text{ mm} \le 320 \text{ mm}$; Altura útil: $5 \times 90 + 4 \times 3 = 462 \text{ mm} \le 470 \text{ mm}$).
  - **Modo Horizontal (0°):** 3 colunas × 12 linhas = **36 etiquetas por folha** (Largura útil: $3 \times 90 + 2 \times 3 = 276 \text{ mm} \le 320 \text{ mm}$; Altura útil: $12 \times 35 + 11 \times 3 = 453 \text{ mm} \le 470 \text{ mm}$).
- **Evolução da Interface:**
  - Mesa de trabalho horizontal ampla (`98vw × 95vh`) no padrão Studio Dark.
  - Drag & Drop nativo direto nos quadrantes da folha e reordenação (swap) entre slots com `pointer-events-none` nos filhos.
  - Recurso **⚡ AutoGang** para preenchimento inteligente da chapa com 1 clique.
  - Controles de Zoom & Pan, ajuste numérico de Gap e Margem em tempo real.
  - Geração de QR Code 100% offline no client-side via biblioteca local (intranet-ready).