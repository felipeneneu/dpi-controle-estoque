# Changelog de Regras de Negócio — GraficaOS (RULE_CHANGELOG)

> **Versão:** 1.0.0 · **Política:** este arquivo é **append-only**. Toda mudança de status/texto de uma BR-* gera uma linha aqui com data, autor, motivo e ADR vinculada. Normalização de texto sem mudança de comportamento → bump de patch, sem ADR.
> **Ver:** `governance/README.md` (processo).

## [1.0.0] — 2026-09-12 — Criação do registro canônico

- **BR-001..BR-021** criadas a partir da digestão de `ESTOQUE-LOGICA-ALGORITMO.md`, schema Drizzle e fluxos de agentes (documentação, sem mudança de código).
- **ADIÇÃO** BR-002 (bobina-ativo), BR-018 (identidade física), BR-019 (configuração por empresa), BR-021 (single deploy por empresa) — todas `TARGET`, ancoradas em ADR-009.
- **ADIÇÃO** ADR-006 (BR-007), ADR-007 (BR-008/012), ADR-008 (BR-006), ADR-009 (BR-002/018/019/021).
- **PROMOÇÃO `PARTIAL →`** de BR-009 (computeStatus duplicado), BR-010 (vínculo vs matcher), BR-015 (WhatsApp multi → doc atualizado), BR-020.
- **MARCAÇÃO `PROPOSED`** BR-017 (briefings agendados — prometido no PRD, não implementado).

## [1.1.0] — 2026-09-13 — Bobina ativa: identificação em máquina e jobs órfãos (M3)

- **ADIÇÃO** ADR-013 (check-in de bobina via widget no canal da máquina no Electron
  client já existente; estado de job órfão `PENDENTE_VINCULO` sem bloquear produção;
  alerta agendado às 17:10 BRT para pendências do dia) | motivo: operacionalizar BR-002
  para a fase M3 (dedução automática por bobina em HP Latex e Mimaki) | ADR-013 | Felipe
- **CORREÇÃO** de numeração: conteúdo inicialmente rascunhado com o ID "ADR-010" por
  engano em versão de trabalho fora do repo — ADR-010 já reservada para decisões do
  data-map Konica (D2..D7); renumerado para ADR-013 antes de qualquer implementação,
  sem impacto em código (nenhuma implementação havia começado) | motivo: evitar colisão
  de ID | ADR-013 | Felipe
- **EXPANSÃO** ADR-009: adicionada seção de BR-021 (configuração por empresa aplicada
  ao modelo de bobina: convenção de ID/QR, enum de estados, localizações, layout de
  etiqueta) — fecha o escopo já registrado no changelog `[1.0.0]` que citava BR-021
  junto de ADR-009, mas ainda não estava redigido no corpo da ADR | motivo: alinhar
  arquivo ao escopo já anunciado no índice/changelog | ADR-009 | Felipe

  ## [1.2.1] — 2026-09-13 — Correção de escopo: Bobina aplicada indevidamente a itens fora do modelo

- **CORREÇÃO** implementação do M1 criou registros de `Bobina` para itens fora do
  escopo decidido (Tinta UV Cyan em ml tratada como "50m restantes"; risco de outros
  itens não-rolo também afetados) | causa raiz: ADR-009 não declarava explicitamente
  exclusões (tinta, papel em folha, materiais rígidos) | correção: emenda na ADR-009
  com seção "Escopo" explícita + reversão das bobinas criadas indevidamente | ADR-009
  | Felipe
- **REBAIXAMENTO** BR-002 de `IMPLEMENTED` para `PARTIAL` — verificação manual (P3)
  encontrou tanto o bug de "Ver Bobinas" vazio no add-roll quanto a generalização
  indevida a itens não-rolo; status `IMPLEMENTED` marcado anteriormente não tinha
  prova válida | ADR-009 | Felipe

  ## [1.2.2] — 2026-09-13 — Emenda ADR-009: baixa de bobina por venda

- **EMENDA** ADR-009: adicionado caso de uso "venda de bobina inteira a cliente",
  reaproveitando location=cliente e state=USED (sem criar estado novo) | motivo:
  necessidade real de dar baixa em rolo vendido inteiro, anotando motivo | ADR-009
  | Felipe


## 2026-09-18 — BR-024 (Imposição) — Sobra de grade explicitada (fill_row default)

**Regra:** BR-024 — "Sobra de grade no impositor não é truncamento silencioso".

**Status da regra:** nova — `IMPLEMENTED` (PR #3a.2, sidecar AutoImposerCLI).

**Mudança:** o CLI legado (Motor 1) passou de truncamento silencioso para
`SurplusPolicy.FillRow` como default — preenche a última linha e declara a sobra
via `--surplus` (`truncate` = exato, `fill_advance` = aproveitamento). A contagem
desenhada no PDF coincide com a reportada (Regra 4 do `AGENTS.md` do core).

**Prova / Teste:**
- `BR_010_ah_MaxCapacity_RespectsForcedOrientation` (969/1015 por orientação) e
  `BR_010_ai_Roll_AutoExtendsToMaxLength` (rolo 2030) em
  `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/CrossMotorTests.cs`.
- Smoke chapa `MontarPDF.bat`: PEDIDO 200 → REAL 209, SOBRA 9 "para refile/amostra".

`source: sidecars/AutoImposerCLI/Imposition/ImpositionBridge.cs` · `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/CrossMotorTests.cs` · missão PR #3a.2 (`.bat` operacional)

## 2026-09-17 — BR-010 (Imposição) — Fonte única de verdade formalizada

**Regra:** BR-010 — "Motor de imposição/step&repeat possui fonte única de verdade".

**Status da regra:** `PROPOSED` → `PARTIAL` (com a PR #1 do `packages/imposition-core`).

**Mudança:** formalização do modelo alvo em 3 ADRs:
- `ADR-021` — GridSearchEngine como fonte única de verdade + resolução de
  defaults em 4 camadas.
- `ADR-022` — Duplex Head-to-Head / Head-to-Foot como camada wrapper.
- `ADR-023` — Contagem verificada (instrumentação + read-back condicional).

**Prova / Teste (P3 do `DOC_POLICIES.md`):**
- Testes unitários e golden-master em
  `packages/imposition-core/tests/Imposition.Core.Tests/` com convenção
  `BR_010_*` (`TESTING_STRATEGY.md` §2).
- Golden-master canônico em
  `packages/imposition-core/tests/Imposition.Core.Tests/GoldenMaster/cases/000-canonical/`
  (`IMPOSICAO-MOTOR.md` §3.1, §8.1).
- CI workflow `.github/workflows/imposition-core.yml` roda em todo PR.

**Notas:**
- As ADRs 021–023 nascem como **Proposto**. Promoção a **Aprovado** ocorre
  após 5 dias consecutivos de CI verde + produção sombra sem divergência de
  contagem (ADR-021 §Nota de honestidade).
- `ADR-024` (não emitido) cobre MachineProfile e presets de job — camadas 2 e
  3 do resolver. Fica para PR subsequente.

`source: docs/governance/adr/ADR-021-gridsearch-engine-fonte-unica.md` · `docs/governance/adr/ADR-022-duplex-wrapper.md` · `docs/governance/adr/ADR-023-contagem-verificada.md`

## Formato de entrada (a partir daqui)

```
## [versao] — data — resumo
- [EVENTO] BR-XXX (...): o que mudou | motivo | ADR-NNN | autor
```

## [1.2.0] — 2026-09-13 — Implementação M1 (Bobina como ativo)

- **IMPLEMENTATION** BR-002, BR-010, BR-018: Cutover realizado. Estoque legado zerado, schema atualizado (`bobinas`, `bleed_adjustment_m`). Jobs órfãos geram status `PENDENTE_VINCULO` em `print_jobs` e `mimaki_jobs`. Fator de sangria aplicado nas deduções (HP/Mimaki). UI do equipamento e dashboard atualizados. | motivo: Migração M1 finalizada via Agent. | ADR-009, ADR-010 | Agent (Antigravity)- 2026-09-13: Emenda na **ADR-009**: Adicionado esclarecimento sobre gest�o de insumos n�o-rolo (tintas e folhas), os quais n�o s�o tratados como ativos f�sicos e utilizam lan�amentos diretos de \IN\/\OUT\/\ADJUSTMENT\ no estoque agregado (\currentQuantity\).
- 2026-09-14: Emenda na **ADR-009**: Gera��o de ID Curto de Bobina (Serial) passa a ser estritamente autom�tica e gerada pelo sistema (formato BOB-XXXX), garantindo padroniza��o para M2/M3 (impress�o de QR Code). Formul�rio de \Novo Insumo\ agora suporta a cria��o simult�nea do primeiro rolo daquele material (cascateamento).

## [1.3.0] — 2026-09-15 — Padronização de Etiquetas Físicas (106x35mm), Imposição Konica e Quick-Switch F2

- **IMPLEMENTATION** BR-002, BR-010, BR-021: Padronização de etiqueta unificada 106×35 mm para bobinas e tintas com QR Code semântico (`BOB:xxxx` / `TNK:xxxx`) e borda contínua de 1pt para guilhotina/meio-corte. Motor client-side de imposição em folha Konica SRA3 (330×480 mm) com rotação 90° (32 etiquetas/folha) e 0° (24 etiquetas/folha). Mesa de imposição estilo Kodak Preps com Drag & Drop nativo, prancha horizontal e AutoGang. Quick-Switch via tecla F2 no canal da máquina com normalização de entrada (`BOB-xxxx`) e política de confirmação de transferência entre equipamentos com segundo Enter | motivo: Operacionalizar etiquetagem física para M2/M3 sem custo de hardware coletor, aproveitando a impressora Konica e o Electron | ADR-014 | Felipe / Agent
- **EMENDA** ADR-014 (Emenda 1): Redimensionamento da etiqueta padrão para 90×35 mm, elevando o aproveitamento na folha Konica SRA3 para 40 unidades (vertical 8×5) e 36 unidades (horizontal 3×12), com controles Preps de Zoom, Gap e Margem em tempo real e geração de QR Code 100% offline | motivo: Maximizar aproveitamento de mídia autoadesiva (+11%) e destrancar Drag & Drop nativo na mesa de imposição | ADR-014 | Felipe / Agent

## [1.4.0] — 2026-09-15 — Arquitetura Sidecar e Ferramentas Nativas (ImpositorKonica WPF)

- **IMPLEMENTATION** BR-010, BR-021: Implementação do sidecar nativo de pré-impressão ImpositorKonica em C# (.NET 8 WPF, DirectX/DrawingContext) com renderização direta em GPU no espaço métrico 1:1, zoom focalizado, atalhos de memória muscular gráfica (F4, P, C, E, T, B, L, R, Ctrl+D) e canal IPC de desacoplamento no Electron (imposer-sidecar.ts / imposition:open). Executável único autocontido distribuído em extraResources | motivo: Eliminar restrições de escala e engasgos de GC do navegador na montagem de chapas industriais SRA3 e integração com spooler Windows | ADR-015, DD-001 | Felipe / Agent
