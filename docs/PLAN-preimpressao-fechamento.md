# PLAN — Pré-impressão e Fechamento de Arquivo (Rewrite do ImpositorKonica)

- **Arquivo:** `docs/PLAN-preimpressao-fechamento.md`
- **Modo:** PLANNING — nenhum código de aplicação foi/é escrito; nenhum binário/instalação é modificado
- **Data:** 2026-09-19
- **Status:** AGUARDANDO APROVAÇÃO → depois IMPLEMENTAÇÃO (Fases 1–6, ver abaixo)
- **Slug:** `preimpressao-fechamento`

---

## 1. Contexto / Objetivo

O usuário pediu: **"Baseado no RELATORIO-illustrator-arch.md, reescrever zoom, prancheta (artboard) e velocidade para criar um software de pré-impressão — imposição, fechamento de arquivo e adicionar marcas de corte — reformulando o ImpositorKonica."**

**Decisões do Socratic Gate (já tomadas — NÃO re-abrir):**
1. **Escopo:** rewrite LIMPO com reaproveitamento — novo app de pré-impressão reutilizando modelos (`ImpositionContract.cs` payload, `PlacedLabel`, `SheetConfig`, `CropMarkItem`), exportador SkiaSharp e `PreviewBridge`/`PdfPageRenderer` existentes, com canvas redesenhado.
2. **Entrada:** PDF de arte REAL do cliente (o fluxo de inventário deixa de ser principal; o modo etiqueta é legado/opcional).
3. **Fechamento de arquivo:** Validar (dimensões, sangria/bleed, cores/PDF-X) + impor (n-up/waste-fit, layout de chapa) + adicionar marcas de corte/registro + exportar PDF final p/ impressão.

**Contexto técnico (fonte):** o relatório `docs/RELATORIO-illustrator-arch.md` documenta a stack do Illustrator 2026: motor vetorial AGM com backend D3D12+OpenGL (§3.3, §4), UI nativa DVA/Drover renderizada via Direct2D/DirectWrite (§5a), `pdfsettings\*.joboptions` (PDF/X-1a/3/4, Press Quality) via PDFL (§2, §4, `pdfl-pdfsettings.md`), artboards multi como modelo de documento (`engine.jsx` lê `doc.artboards[].artboardRect`), e **ausência de motor de imposição nativo** (§4.1: C-SEP/imposition = 0 arquivos, 0 strings) — o que posiciona o nosso fechamento C#/Skia como o "motor de fechamento" do fluxo. O caminho COM → `DoJavaScript` (§7.1) é a integração oficial com o Illustrator (já usada por `IllustratorImposerCLI`).

**Sucesso mensurável:**
1. PDF de arte real do cliente abre, páginas viram peças, `GridSearchEngine.Plan` (imposition-core, ADR-021/025) calcula n-up waste-fit e o canvas renderiza a chapa imposta a ≥60 FPS com pan/zoom suave (precedente ADR-015/DD-001).
2. Fechamento com gate de preflight: erros bloqueiam, avisos são confirmáveis; relatório de dimensões/sangria/cor visível antes do export.
3. PDF final exportado com marcas de corte/registro, sangria respeitada e contagem verificada (`plannedUnits == drawnUnits == readBackUnits`, Regra 4 do AGENTS.md do imposition-core / BR-010 / ADR-023).
4. Modo etiqueta (90×35, QR, inventário) permanece funcional como legado opcional — nada do que hoje compila deixa de compilar.
5. Nenhum número inventado; hipóteses técnicas marcadas como "a validar" ao longo do plano.

**Não-escopo:** nenhuma alteração na instalação do Illustrator ou do Kodak Preps; nenhum binário novo de terceiros sem ADR; nenhuma mudança de `ImpositionInput` sem ADR (Regra 6 do AGENTS.md do `imposition-core`).

---

## 2. Escopo — Fases numeradas

> Convenção: cada tarefa tem `INPUT → OUTPUT → VERIFY`; 2–10 min de execução, uma saída clara, rollback explícito. Paralelo = arquivos/agentes distintos; serial = mesmo arquivo/contrato.

```
FASE 1 (canvas) ──► FASE 2 (import PDF) ──► FASE 3 (preflight) ──► FASE 4 (marcas) ──► FASE 5 (export) ──► FASE 6 (reuso/embalagem)
     │                      │                       │                     │
     └── T1.1 (auditoria legado, code-archaeologist) roda antes de todas
```

---

### FASE 1 — Motor de canvas/prancheta (zoom, artboard, performance)

Inspiração do relatório: **AGM** (render vetorial GPU, backends D3D12/OpenGL — §3.3/§4) e **DVA/Drover** (UI Direct2D/DirectWrite — §5a). No nosso caso o canvas é WPF `DrawingContext` (GPU via RenderCapability.Tier 2, precedente ADR-015/DD-001 §4.1) — mantemos esse modelo; não migramos para outro motor de render nesta fase.

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T1.1** Auditoria do legado (mapa do `CanvasImposicao.cs`, 1060 linhas) | `sidecars/ImpositorKonica/Views/CanvasImposicao.cs`, `MainWindow.xaml.cs`, `Models/*` | Nota curta em `docs/engineering/REWRITE-IMPOSITOR-ESTADO.md` listando: linhas do pan/zoom, hardcodes (40/36 em `MainWindow.xaml.cs:50`, 90×35 em `ExecuteAutoGang` `CanvasImposicao.cs:761-809`, arm 2mm em `ImpositionContract.cs:161`), afinações de perf já presentes (`_qrCache`, `_pieceThumbnail`) | Nota existe e cada item tem referência `arquivo:linha`; nenhum número inventado; pendências marcadas "a validar" |
| **T1.2** Modelo `ArtboardDocument` (artboard = chapa) | Nota T1.1 + conceito de artboards do `engine.jsx` (`artboardRect`) e relatório §4.1 (artboard como envelope do documento) | `Models/ArtboardDocument.cs`: lista de artboards (1 artboard = 1 chapa), artboard ativo, origem de coordenadas por artboard (mm), coleção de peças por artboard; refactor: `PlacedLabel` → conceito `PlacedPiece` (renomeação mínima, preservando `Id/X/Y/Width/Height/Rotation/CropMarks`) | `dotnet build` do sidecar compila; payload legado (`ImpositionPayload`) ainda desserializa; multi-artboards renderiza sem quebrar tela |
| **T1.3** Viewport engine reescrito (zoom focalizado suave + inércia) | `CanvasImposicao.cs` (zoom atual) + DD-001 §4.2 (zoom focalizado) | Nova camada de viewport: zoom **suave/animado** ancorado no cursor (factor contínuo, não degrau 1.15), pan com inércia (a validar), clamp por níveis (fit artboard / fit all / 100% / 2× / 25× máx. proposto), zoom-to-selection, atalhos F4/ZoomIn/Out/100 preservados (`MainWindow.xaml.cs:82-85,222-225`) | 60 FPS em pan/zoom (medição manual com grade 40+ peças); zoom mantém o ponto sob o cursor sem salto; atalhos existentes funcionam |
| **T1.4** Performance: cache + virtualização + zero-alocação | T1.1 (itens de perf), `OnRender` atual | (a) cache de geometrias por artboard+peça (estender `_qrCache` p/ peças PDF); (b) **virtualização do canvas**: desenhar só artboards/peças dentro do viewport; (c) zero-allocation por frame (pens/brushes congelados, slug com cache de `FormattedText`, evitar realocação de lista em loop); (d) **remover IO no caminho de Undo** — `SaveSnapshot`/`Undo` hoje escrevem `undo_debug.txt` (`CanvasImposicao.cs:1020`, `System.IO.File.AppendAllText`) | Profiler/`dotnet-trace` (a validar) mostra 0 alocação dominante por frame em interação; `undo_debug.txt` não é mais criado |
| **T1.5** Guias/régua/margem por artboard + status real | `MainWindow.xaml.cs` (status bar `UpdateStatus` linha 47) | Régua mm + guias de margem/sangria por artboard (inspiração Direct2D/DirectWrite do relatório §5a); barra de status com capacidade/ocupação **vinda do core** (remover hardcode 40/36 da linha 50) | Status exibe contagem real das peças posicionadas; régua alinha com coordenadas mm do canvas; screenshot comparativo aprovado |

**Rollback Fase 1:** cada commit é revertível; modelo legado de etiquetas permanece intacto até T1.2 nos dois mundos (tela + export).

---

### FASE 2 — Importação de PDF de arte real

Entrada principal do software (Decisão 2). Reaproveita `Preview/PdfPageRenderer.cs` (thumbnail via PdfiumViewer, dpi 150 default, cache `_cached`) e `Preview/PreviewBridge.cs` (mapeia `ImpositionResult` → canvas read-only). Integra `packages/imposition-core` (ADR-021/023/024/026).

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T2.1** Spike: ler dimensões de páginas do PDF + definir estratégia de render | PDF de arte cliente (amostra real 1–5 páginas), `PdfPageRenderer.cs`, `PdfiumViewer`, `AutoImposerCLI` (precedente MediaBox) | Nota `docs/engineering/SPIKE-IMPORT-PDF.md` com veredito: qual API expõe MediaBox/CropBox confiável (PdfiumViewer expõe tamanhos de página? — **a validar**, senão parse via PdfSharp 6.1.1 XPdfForm como o AutoImposerCLI já usa ou lib leve); estratégia de raster p/ canvas (PdfiumViewer) vs vetor p/ export (Fase 5) | Veredito com build reproduzível; dimensões de 1 página conferida manualmente com um leitor de PDF; hipóteses marcadas "a validar" |
| **T2.2** `PdfArtImporter` (contrato de entrada) | PDF real + T2.1 | `Import/PdfArtImporter.cs`: lista páginas (index, largura/altura mm), valida PDF abre (senha não suportada → erro `E_PDF_PROTECTED`), páginas > 0, tamanho razoável (0 < W/H < 2000 mm — **limites a validar com máquina Konica**), prepara `sourcePath` | Importa PDF de 1 e N páginas; erro limpo p/ PDF protegido; `dotnet build` verde |
| **T2.3** Páginas→peças + plano via `GridSearchEngine` | `ImpositionInput` (contrato exato do core), T2.2 | Mapear cada página → `PieceSpec(W,H)`; montar `ImpositionInput` com `SubstrateSpec` (kind=sheet, width/initialLength da chapa, `BleedMm`, `RegisterMm`, `ToleranceMm`), `GapSpec`, `MarginSpec` per-side, `TargetCopies`, `SurplusPolicy`, `ScalePolicy`, `ForcedOrientation=null`; chamar `GridSearchEngine.Plan` in-process (ADR-021/025) e consumir `Placements` | Golden-master do core continua verde (Regra 2); para uma entrada de teste, `Cols×Rows` e `Total` conferem com capacidade manual; `PlannedUnits` respeita a chapa |
| **T2.4** Render das páginas no canvas (peças = páginas) | T2.3 + `PreviewBridge`/`PdfPageRenderer` | Alimentar canvas com peças por `Placements`: página renderizada (dpi 150, cache) como `_pieceThumbnail` de cada peça; rótulo "Página N" (modo arte) substitui layout etiqueta 90×35 quando ativo; manter `LoadPreviewLabels` | Canvas mostra a página real dentro de cada slot; zoom T1.3 funciona com 40+ peças a 60 FPS; screenshot da chapa imposta com arte visível |
| **T2.5** Sangria/bleed: cálculo e exibição | `SubstrateSpec.BleedMm` (já existe no core), decisão do usuário | Área de sangria por peça desenhada no canvas (camada opcional); default proposto 2–3 mm **a validar com a operação Konica**; exibição separada da margem de segurança de 5 mm | Toggle de sangria liga/desliga a camada; valores default documentados como proposta |

**Rollback Fase 2:** flag `--legacy-label-mode` (modo etiqueta) preserva o fluxo atual; importador é aditivo.

---

### FASE 3 — Fechamento de arquivo (validação/preflight)

"Fechar" = validar ANTES de impor/exportar. Modelo inspirado nos joboptions do Illustrator (`pdfl-pdfsettings.md` §3: dicionário PostScript estilo Distiller, PDF/X-1a/3/4, Press Quality) e no comportamento do `engine.jsx` (usa `artboardRect`, PDFSaveOptions). **O relatório §4.1 confirma que o Illustrator não tem imposição — o fechamento é nosso.**

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T3.1** Spike de inspeção de conteúdo (cor, fontes, transparência) | PDF cliente real; libs candidatas: `UglyToad.PdfPig` (Apache 2.0, **a validar**) vs parse próprio vs heurística de render | Nota `docs/engineering/SPIKE-PREFLIGHT-PDF.md` com veredito de como detectar: espaços de cor (CMYK vs RGB) por content stream, fontes embutidas, transparência; **se adicionar dependência de runtime → ADR** (DOC_POLICIES + regras de build) | Veredito técnico com amostra; cada método testado contra ≥1 PDF de exemplo; limitação documentada (PDF comprimido/object streams — mesmo risco do MediaBox regex do orquestrador, IMPOSICAO-MOTOR §5.7) |
| **T3.2** Modelos `PreflightSpec`/`PreflightReport` | Decisões do gate (valores camada 4) | `Validation/PreflightSpec.cs` (limites: dimensão máx, sangria mínima, espaço de cor alvo, alvo PDF/X) e `PreflightReport.cs` (severity Error/Warning, código `E_*`/`W_*` pt-BR, mensagem, ref da peça) | Round-trip JSON; erros vs avisos distinguidos; sem default inventado — defaults declarados como proposta |
| **T3.3** Check dimensões (Regras 1 e 3 do core) | `ImpositionInput` + resultado do `GridSearchEngine` | Peça cabe na área útil da chapa com `tol = max(toleranceMm, registerMm, 0.1)` ANTES de qualquer floor (Regra 1); chapa fixa nunca transborda (Regra 3) | Teste unit BR-*-preflight: peça que não cabe → `E_*`; borda exata (665/19 = 35.0000001) → passa com tolerância |
| **T3.4** Check sangria | T2.5 + T3.1 | Detecção presença/ausência de sangria por peça (metodologia do T3.1 **a validar**; heurística candidata: comparação de TrimBox/CropBox vs conteúdo no limiar da borda); `scalePolicy=bleed` permite folga via sangria (core já suporta) | Relatório marca "sangria ausente" como warning (não erro) em V1 (decisão a validar); escala/bleed reportado conforme core |
| **T3.5** Check cor e alvo PDF/X | T3.1 + joboptions (`pdfl-pdfsettings.md` §3) | Reportar: RGB presente (warning, conversão a definir), transparência (aviso; alvo muda para PDF/X-4 se preciso — **a validar**), fontes não embutidas (**a validar**); definir alvo default "Press Quality" (PDF 1.4, CMYK, 300dpi) emulado na exportação | Checklist do preflight mostra 0 erros e N avisos documentados p/ o PDF de teste; alvo PDF/X-1a vs X-4 configurável |
| **T3.6** Gate de fechamento + UI de report | T3.2–T3.5, `MainWindow` | Dialog/status de fechamento: erros bloqueiam Save (exit `4` proposto), avisos exigem confirmação; lista navegável (mensagem → peça) | Fluxo manual: PDF com dimensão errada bloqueia; PDF ok fecha com 0 erros; exit codes alinhados com ADR-015/contrato multi-rodadas (exit 4 já usado pelo core, IMPOSICAO-MOTOR §3.5) |

**Rollback Fase 3:** preflight é camada aditiva; se `--skip-preflight` não for aceito em V1, o fluxo legado de etiqueta não preflighta (decisão a validar) e continua funcionando.

---

### FASE 4 — Marcas de corte e registro

Reformula `CropMarkItem` (arm 2mm hardcoded em `ImpositionContract.cs:161`) em sistema configurável. Constrói alinhado com `docs/PLAN-marcas-imposicao.md` (que planeja marcas no motor 1 — AutoImposerCLI): âncoras mm, offsets, `outsideonly`, cor em %.

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T4.1** `MarksSpec`/`MarksEngine` (modelo) | `CropMarkItem.cs`, `PLAN-marcas-imposicao` §2.2/§3, decisão do usuário | `Marks/MarksSpec.cs`: crop/trim marks (braço mm, espessura, cor, `outsideonly`, ganho/cut inset), registro (4 cantos, cruz+círculo, cor K100 default), slug line (texto/template), dropshadow (bool), sangria sob marcas; engine de resolução de posições (âncora + offset em mm) | Unit: braço 3 mm gera 8 marcas por peça nas posições esperadas ±0,1 mm; default legado (arm 2 mm, K100, sem dropshadow) reproduz o comportamento atual |
| **T4.2** Render de crop/trim no canvas | T4.1 + CanvasImposicao | Desenho das marcas de corte por peça no canvas (substitui `DrawCropMarks`), respeitando rotação 90 (mesmo problema de coordenadas já resolvido em `DrawLabel`/exporter com centroide — IMPOSICAO-MOTOR §5.6) | Toggle marcas liga/desliga; rotação 0/90 mantém marcas coladas ao slot; screenshot comparado ao modo legado sem regressão visual |
| **T4.3** Marcas de registro na chapa | T4.1 | Crucetas/círculos de registro nos 4 cantos da área útil (fora do trim), cor configurável; opcional colorbar CMY **a validar uso operacional** | Registro presente no PDF de teste nas coordenadas previstas ±0,1 mm; não colide com peças (fora do trim) |
| **T4.4** Slug line + dropshadow | `CanvasImposicao.cs:178-192` (slug atual em `DrawSlugLine`), T4.1 | Slug técnico com dados reais do job (job name, data, máquina, contagem do core — sem hardcode 40/36); dropshadow opcional atrás das peças/marcas; render no canvas E no export (Fase 5) | Slug reflete contagem real (ex.: "35×12 = 420 UN"); truncamento sem estouro (regra R6 do PLAN-marcas); `_pieceThumbnail` não é ofuscado pelo dropshadow |

**Rollback Fase 4:** marcas default reproduzem o legado (regressão = bloqueante); flags de marca desligam camadas.

---

### FASE 5 — Exportação PDF final

Exporta chapa imposta válida com marcas — alvo Konica/produção. Reaproveita `Export/SkiaPdfExporter.cs` (textos em curva via `DrawTextAsPath`, QR vetorial, `MmToPt = 72/25.4`) e estende para páginas de arte. O relatório §4.1 (sem imposição no Ai) e `pdfl-pdfsettings.md` (joboptions) fundamentam que **a geração final é responsabilidade nossa**.

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T5.0** Spike: vetor vs raster da arte no PDF final | `AutoImposerCLI/Program.cs` (já embute arte como Form XObject com PdfSharp 6.1.1 — IMPOSICAO-MOTOR §2/§4.1), `SkiaPdfExporter.cs` | Nota `docs/engineering/SPIKE-EXPORT-FINAL.md`: (a) manter 100% SkiaSharp com página rasterizada em 300–600 dpi (**qualidade 1200 dpi da Konica a validar**) ou (b) híbrido: canvas/Skia p/ marcas+layout + PdfSharp p/ embutir arte vetorial; decidir default | Veredito com PDF de teste aberto em viewer e prova de impressão; tamanho do arquivo e nitidez documentados |
| **T5.1** Refatorar `SkiaPdfExporter` (ou novo `PrepressExporter`) | T5.0 + T2.4 + T4.1 | Exportar chapa: página com boxes — MediaBox = chapa, TrimBox = área útil, BleedBox = área útil + sangria (exatidão das boxes no backend Skia a validar); arte da peça no slot; marcas e slug; **cores das marcas em DeviceCMYK** (hoje `SKColors.Black` = RGB no `SkiaPdfExporter.cs:31-34`); IMPOSICAO-MOTOR §5.5/§5.9 aponta ausência de bleed/cutInset nos motores — corrigir no novo export | PDF abre; posições das peças coincidem com `Placements` do core ±0,1 mm; marcas nas coordenadas previstas; modo etiqueta legado continua exportando via caminho antigo |
| **T5.2** Contagem verificada (Regra 4 / BR-010 / ADR-023) | `ImpositionResult` + PDF gerado | `plannedUnits == drawnUnits == readBackUnits`; checksum SHA-256; naming no padrão do repo (ex.: `_IMPOSTO_{W:F0}x{H:F0}mm_{N}UN.pdf` — padrão do AutoImposerCLI; manter ou novo padrão pre-press **a validar com usuário**) | Script/`PdfReadBack` conta formas da chapa gerada e bate com `Total`; golden-master sem marcas continua igual (Regra 2) |
| **T5.3** Fechamento p/ produção + exit codes | T3.6 + ADR-015 (exit codes 0/1/2/3) + IMPOSICAO-MOTOR §3.5 (exit 4) | Joboptions emulado (default "Press Quality": PDF 1.4, CMYK, fontes embutidas/curvas, sem transparência — limites do backend Skia **a validar**); alvo PDF/X-1a/3/4 configurável; exit codes: 0 sucesso / 1 cancelado / 2 argumento/leitura / 3 erro export / **4 preflight bloqueia** (novo) | PDF de teste passa no gate; exit 4 testável com PDF inválido; scripts `.bat`/Electron existentes não quebram (códigos aditivos) |

**Rollback Fase 5:** caminho legado `SkiaPdfExporter.ExportarParaPdf` (assinatura atual) preservado; novo export aditivo.

---

### FASE 6 — Reaproveitamento/embalagem

Biblioteca de núcleo pre-press reutilizável + integração opcional com Illustrator. O relatório §7.1 confirma COM/`DoJavaScript` como caminho oficial (`IllustratorImposerCLI` + `engine.jsx`); **decidir** se a geração final permanece 100% C#/Skia (default proposto) ou delega ao Illustrator (opcional desligado).

| Tarefa | INPUT | OUTPUT | VERIFY |
|--------|-------|--------|--------|
| **T6.1** ADR de pré-impressão/fechamento | Relatório Illustrator §4.1/§7.1, ADR-015/017/021/025, `AGENTS.md` Regra 6, BUILD.md §7 (mudança de `.csproj` = ADR) | ADR (ex.: `ADR-042-preimpressao-fechamento`, numeração a confirmar no `ADR_INDEX`): contrato `ArtPageSpec`/`PreflightSpec`/`MarksSpec`, decisão export 100% C# vs delegação Illustrator, dependências novas, gatilhos de reavaliação | Segue `ADR_TEMPLATE.md`; `ADR_INDEX.md` atualizado; `docs:check` verde (script referenciado nas guidelines; execução exata **a validar**) |
| **T6.2** Extrair núcleo pre-press reutilizável | T2.2–T5.3 | Camada `Prepress.Core` (dentro de `ImpositorKonica` ou em `packages/imposition-core` — ver ADR): import, preflight, marks, export como serviços independentes da UI; atualizar contrato vivo `IMPOSICAO-MOTOR.md` (§6 modelo alvo de gang-run multi-SKU → evolução do `ExecuteAutoGang`) | `dotnet build` de toda a solução verde; nenhum hardcode 40/36 remanescente no caminho novo; serviços consumíveis por teste sem UI |
| **T6.3** Embalagem e modo `--preview` | `.csproj` (net10.0-windows, win-x64, single-file, NATIVE Pdfium/Skia, `PublishSingleFile`), ADR-025 | Manter publish autocontido; `electron-builder` `extraResources` (padrão ADR-015/DD-001 §6); `--preview --data` continua funcionando (`PreviewMode.cs`) e passa a usar o novo canvas/import | `dotnet publish` gera exe único; App abre `--preview` com PDF de teste; `npm run package:client` completável (fora do ciclo básico de build, BUILD.md §7) |
| **T6.4** (Opcional) Bridge `--delegate-illustrator` | `IllustratorImposerCLI` + `engine.jsx` (relatório §7.1), decisão do T6.1 | Bridge que, quando habilitada, gera a chapa via COM/`DoJavaScript` em vez do export C#; **default desligado** em V1 | Build do `IllustratorImposerCLI` não quebra (`npm run build:cli:illustrator`); smoke manual com Illustrator instalado (se ausente → skip documentado, padrão do golden-master IMPOSICAO-MOTOR §8.1) |

**Rollback Fase 6:** camada extraída é aditiva; bridge opcional desligado não altera o fluxo default.

---

## 3. Estado atual / evidências (já verificadas — NÃO refazer)

### 3.1 Capacidades atuais do ImpositorKonica (verificadas na fonte)

| Capacidade | Onde (arquivo:linha) | Nota |
|---|---|---|
| Canvas métrico 1 un = 1 mm; `Matrix` de view | `Views/CanvasImposicao.cs:16,128-129` | Modelo espacial a preservar |
| Zoom focalizado 1.15×, clamp 0.2–25× | `CanvasImposicao.cs:367-379` | Degrau fixo; será suavizado na F1 |
| ZoomExtents / ZoomIn / ZoomOut / ResetZoom100 | `CanvasImposicao.cs:381-423` | Atalhos F4 etc. em `MainWindow.xaml.cs:82-85` |
| Marquee + drag&drop com snapshot | `CanvasImposicao.cs:50-53,546-560,585-610,643-671` | Reaproveitar interação |
| Undo/Redo (com IO de debug — bug) | `CanvasImposicao.cs:69-71,1003-1048` (`undo_debug.txt` em 1020) | IO por frame = risco de perf; remover na F1 |
| AutoGang hardcoded 90×35 / 35×90 | `CanvasImposicao.cs:761-809`; capacidade 40/36 também em `MainWindow.xaml.cs:50` | Substituir por `GridSearchEngine` na F2 |
| Crop marks com arm 2mm | `Models/ImpositionContract.cs:159-179` (`GenerateCropMarks`) | Refatorar na F4 (`CropMarkItem.cs`) |
| Cache de geometria QR (`_qrCache`) | `CanvasImposicao.cs:34-35,320-330` | Padrão a estender p/ peças PDF |
| Thumbnail de peça (`_pieceThumbnail`) | `CanvasImposicao.cs:894-902` via `LoadPreviewLabels` | Base da F2 (`PdfPageRenderer`) |
| Slug line | `CanvasImposicao.cs:178-192` | Refatorar na F4 (dados reais) |
| Export Skia (`MmToPt=72/25.4`, textos em curva, QR vetorial) | `Export/SkiaPdfExporter.cs:13,59-60,97-144,188-199` | Base da F5; `SKColors.Black` = RGB hoje — cor de marca a corrigir |
| Preview 1ª página via PdfiumViewer (dpi 150, cache) | `Preview/PdfPageRenderer.cs:13-49` | Reaproveitar na F2 |
| Preview read-only `--preview` (ADR-025) | `Preview/PreviewMode.cs:16-79`, `Preview/PreviewBridge.cs` | `ImpositorKonica --preview --data <json>` já existe |
| Contrato payload (sheet, margem, gap, itens, PlacedLabel) | `Models/ImpositionContract.cs` | Base do rewrite (Decisão 1) |
| Chapa SRA3 330×480 e presets | `Models/SheetConfig.cs:41-51` | Manter; adicionar presets de arte |
| net10.0-windows, WPF, QRCoder/SkiaSharp/PdfiumViewer, ref. Imposition.Core | `ImpositorKonica.csproj:5-28` | Stack confirmada; single-file, win-x64 |

### 3.2 Pontos do relatório Illustrator aplicáveis (com referência)

| Conceito Illustrator (relatório) | Aplicação neste plano |
|---|---|
| AGM — motor vetorial com backends D3D12+OpenGL e compilador de shader (RELATORIO §3.3, §4 "AGM") | Inspiração de performance: render vetorial em GPU (WPF DrawingContext Tier 2), cache de geometrias, evitar realocação por frame (T1.4) |
| DVA/Drover — UI Direct2D/DirectWrite (RELATORIO §5a) | Camada de régua/guias/texto com fonte limpa e anti-aliasing em tela (T1.5); texto vetorizado na saída (F5 mantém `DrawTextAsPath`) |
| Artboards multi como modelo de documento (`artboardRect` no `engine.jsx:38-45,116-118`) | "Prancheta = chapa": `ArtboardDocument` multi-artboard (T1.2); métricas reais na barra de status (T1.5) |
| PDFL/pdfsettings: joboptions PDF/X-1a/3/4, Press Quality (RELATORIO §2, §4 PDFL; `pdfl-pdfsettings.md` §3) | Alvo de fechamento emulado no export (T3.5/T5.3): boxes, CMYK, sem transparência, fontes |
| §4.1: C-SEP/imposição **ausente** no Ai; prepress limitado a TrimMark/Overprint/SeparationPreview | O fechamento (n-up + marcas + PDF final) **é nosso**; não depende de nenhum motor de imposição Adobe |
| §7.1: COM → `DoJavaScript` oficial (IllustratorImposerCLI + engine.jsx, auto-cure TypeLib, PDFSaveOptions ACROBAT8) | Integração opcional em F6 (T6.4); default desligado |
| §4.1/§7 arte importada via `app.open`, `artboardRect` (mm↔pt) | Confirma a necessidade de ler dimensões da página de PDF na importação (T2.1) |

---

## 4. Agent assignments

| Fase | Agente(s) | Responsabilidade | Depende de |
|------|-----------|------------------|------------|
| **Fase 1** | `frontend-specialist` (principal) + `code-archaeologist` (apoio) | Canvas/prancheta/perf: `ArtboardDocument`, viewport suave, virtualização, cache, remoção de IO de debug | T1.1 (auditoria) antes das demais |
| **Fase 2** | `backend-specialist` (principal) + `frontend-specialist` (integração canvas) | Import PDF, mapeamento páginas→peças, `GridSearchEngine.Plan`, render | Fase 1 (canvas novo) |
| **Fase 3** | `backend-specialist` (principal) + `test-engineer` (suíte preflight) | Preflight: spikes, `PreflightSpec/Report`, checks, gate | Fase 2 (peças + plano) |
| **Fase 4** | `frontend-specialist` (canvas) + `backend-specialist` (export) | Marcas/registro/slug/dropshadow — modelo e render em tela e PDF | Fase 1 (canvas) + Fase 3 (gate p/ fechar com marcas) |
| **Fase 5** | `backend-specialist` (principal) + `test-engineer` (verificação) | Export final, boxes, contagem verificada, exit codes | Fases 2–4 (peças, preflight, marcas) |
| **Fase 6** | `code-archaeologist` (reuso legado) + `backend-specialist` + `documentation-writer` | ADR, extração `Prepress.Core`, embalagem, bridge opcional | Todas as anteriores |
| **Phase X** | `test-engineer` (principal) + `frontend-specialist` (UX) | Checklist final, builds, smoke manual, marcador ✅ | Fases 1–6 |

> Regra do fluxo: serial **dentro** da fase quando compartilha arquivo/contrato (F1 → F2 → F3 → F4 → F5 → F6); paralelo **entre** tarefas de arquivos distintos (ex.: T4.2 canvas e T4.3 registro podem rodar juntas; T5.2 e T5.3 em arquivos diferentes).

---

## 5. Verification checklist (Phase X)

> Nenhum item pode ser marcado `[x]` sem executar a verificação correspondente. Comandos reais do repo (confirmados em `package.json` e `docs/engineering/BUILD.md`).

- [ ] **Build solução completa:** `npm run build:core` (compila os 6 projetos da `packages/imposition.slnx`, incluindo `ImpositorKonica` e `IllustratorImposerCLI` — BUILD.md §6) sem erros
- [ ] **Testes do core:** `npm run test:all` — suíte do `imposition-core` verde, incluindo golden-master canônico (19×34/665×986/1015 — Regra 2) inalterado
- [ ] **Build específico (alternativa/CI Windows):** `dotnet build sidecars/ImpositorKonica/ImpositorKonica.csproj -c Release` (net10.0-windows)
- [ ] **Sidecar Illustrator intacto:** `npm run build:cli:illustrator` — `IllustratorImposerCLI` continua publicando (F6 T6.4 não quebra nada)
- [ ] **Contagem verificada (Regra 4 / BR-010 / ADR-023):** para um PDF de teste, ler o PDF gerado e conferir `plannedUnits == drawnUnits == readBackUnits`; com marcas ligadas, a contagem de peças permanece só peças (padrão do PLAN-marcas §7 T2.2/R4)
- [ ] **Preflight:** PDF com dimensão que não cabe → bloqueio `E_*` (exit 4); PDF ok → 0 erros; sangria ausente = warning (decisão a validar)
- [ ] **Perf manual:** pan/zoom com 40+ peças a 60 FPS; nenhum `undo_debug.txt` criado; zero alocação dominante por frame
- [ ] **Modo legado:** payload de inventário atual (etiquetas 90×35 + QR) ainda abre e exporta pelo caminho antigo
- [ ] **Modo `--preview`:** `ImpositorKonica.exe --preview --data <canonical.json>` retorna exit 0 (ADR-025) com o novo canvas
- [ ] **Frontend/Electron:** `npm run build:export` verde; `npm run package:client` completável (fora do ciclo obrigatório, BUILD.md §7)
- [ ] **Regras visuais/compliance:** sem cores roxas/violeta; sem layout de template padrão; screenshot datado das telas principais
- [ ] **Gov/docs:** ADR da F6 criado + `ADR_INDEX.md` atualizado; `docs:check` verde (script referenciado nas guidelines — execução exata **a validar**); `IMPOSICAO-MOTOR.md` atualizado (T6.2)
- [ ] **Sem artefatos:** `git status --porcelain` sem `TestResults/`, `sidecars/bin/`, `bin/obj/` novos fora do esperado
- [ ] **Marcador final** adicionado ao final deste arquivo quando tudo passar:

```markdown
## ✅ FASE X COMPLETA
- Build/core: ✅
- Preflight: ✅
- Contagem verificada: ✅
- Marcas/export: ✅
- Docs/ADR: ✅
- Data: 2026-09-19 (implementação)
```

---

## 6. Deliverables

| Artefato | Caminho | Quando |
|----------|---------|--------|
| Plano de rewrite pré-impressão | `docs/PLAN-preimpressao-fechamento.md` | **Agora (esta fase)** |
| Nota de auditoria do legado | `docs/engineering/REWRITE-IMPOSITOR-ESTADO.md` | Fase 1 (T1.1) |
| Nota spike import PDF | `docs/engineering/SPIKE-IMPORT-PDF.md` | Fase 2 (T2.1) |
| Nota spike preflight | `docs/engineering/SPIKE-PREFLIGHT-PDF.md` | Fase 3 (T3.1) |
| Nota spike export final | `docs/engineering/SPIKE-EXPORT-FINAL.md` | Fase 5 (T5.0) |
| ADR de pré-impressão/fechamento (+ índice) | `docs/governance/adr/ADR-0XX-preimpressao-fechamento.md`, `docs/governance/ADR_INDEX.md` | Fase 6 (T6.1) |
| Código novo (canvas, import, preflight, marcas, export) | `sidecars/ImpositorKonica/{Views,Import,Validation,Marks,Export}/*` | Fases 1–5 |
| Camada reutilizável `Prepress.Core` (se ADR aprovar) | `packages/imposition-core` ou `sidecars/ImpositorKonica/Prepress.Core` | Fase 6 (T6.2) |
| Contrato vivo atualizado | `docs/engineering/IMPOSICAO-MOTOR.md` | Fase 6 (T6.2) |
| Checklist Fase X preenchido | Seção §5 acima + marcador | Phase X |

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **PDF de arte complexo** (object streams, fontes não embutidas, transparência, cores spot) | Import/preflight impreciso; mesmos riscos do MediaBox por regex (IMPOSICAO-MOTOR §5.7) | Spikes T2.1/T3.1 decidem técnica contra amostras reais; heurísticas marcadas "a validar"; nunca bloquear silenciosamente — reportar warning |
| **Sangria ausente no arte do cliente** | Corte deslocado/refugo | Warning no preflight + política `scalePolicy=bleed` (core já suporta); default sangria 2–3 mm **a validar com a operação** |
| **Alvo PDF/X (X-1a vs X-3/4)** | Gráfica rejeita o arquivo se não conformar | Emular joboptions default "Press Quality"; PDF/X configurável; limitações do backend Skia/PdfSharp documentadas no spike T5.0 |
| **Perf com muitas peças (n-up grande)** | Queda de FPS; alocação por frame | Cache + virtualização (T1.4); remoção do IO de debug; medir com 40+ peças |
| **net10.0-windows / win-x64 / single-file** | Falha de publish ou de runtime nativo (Pdfium/Skia) | `IncludeNativeLibrariesForSelfExtract` já presente no csproj; smoke `--preview` obrigatório; BUILD.md §6 (slnx é Windows-only) |
| **Licenças Skia/Pdfium** | Restrições de distribuição | SkiaSharp (MIT) e PdfiumViewer (Apache 2.0) já fazem parte do csproj; nova dependência de runtime (ex.: PdfPig) passa por ADR (T3.1) |
| **Dependência opcional do Illustrator** | Ambiente sem Ai instalado | Bridge `--delegate-illustrator` default desligado; golden-master marca skip se Ai ausente (IMPOSICAO-MOTOR §8.1) |
| **Contagem divergente ao adicionar marcas** | BR-010 quebra (marcas como `Do` no read-back) | Separar peças × marcas na contagem (padrão PLAN-marcas T2.2/R4); teste com marcas ligadas e desligadas |
| **Quebra do fluxo legado de etiquetas** | Operação atual para | Modo etiqueta preservado (flag/caminho antigo intacto até F6 decidir); golden-master + regressão manual |
| **Troca de contrato do `imposition-core`** | ADR obrigatória (Regra 6) | Toda mudança de `ImpositionInput`/schema via ADR (T6.1); manter `SchemaVersion` compatível |

---

## 8. Próximos passos

1. Aprovação deste plano (usuário).
2. Iniciar IMPLEMENTAÇÃO: Fase 1 (`code-archaeologist` auditoria T1.1 → `frontend-specialist` T1.2–T1.5) → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6.
3. Executar os spikes como gates de decisão: T2.1 (import), T3.1 (preflight/cor), T5.0 (export vetor vs raster) — qualquer um pode adiar decisões definitivas sem bloquear as fases anteriores.
4. Atualizar a checklist §5 conforme cada fase termina (nunca `[x]` sem executar).
5. Fechar com o marcador ✅ da Fase X neste arquivo, e ADR da Fase 6 aprovada antes de tocar em contrato.
