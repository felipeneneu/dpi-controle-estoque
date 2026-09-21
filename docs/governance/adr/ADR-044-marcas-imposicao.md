# ADR-044: Marcas de Imposição (Crop + Mimaki Tipo 1)

- **Status:** Proposto
- **Data:** 2026-09-21
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / prepress
- **Links:** BR-010, BR-021; complementa ADR-043.

## Contexto

O motor `imposition-pdf` (ADR-043) preserva OCG. Mas as marcas de corte
(L-shapes) precisam ser **adicionadas** ao PDF imposto para:
- Konica: referência de guilhotina (corte reto).
- Mimaki: leitura óptica pela plotter (corte de faca).

Spike anterior identificou as marcas Mimaki Tipo 1 (OutTombo):
- L-shape em cada canto da grade.
- Haste 10/15/25mm, espessura 1mm.
- Cor 100% K (ou RDG para papel escuro).

## Decisão

### 1. Marcas renderizadas no fluxo QDF

A camada `MARCAS` não foi injetada como objeto OCG isolado nesta iteração para manter a simplicidade estrutural (mitigando reescritas perigosas do catálogo PDF). Elas são desenhadas como content stream vetorial adicionado no topo da grade no QDF gerado.

### 2. Renderer via QDF

Não usar `XGraphics` (PdfSharp). Desenhar via QDF:
- Adicionar nova página (ou modificar a existente).
- Inserir content stream com `q ... cm S Q` para cada linha.

### 3. Sem AITag neste PR

AITag é metadado privado da Adobe + Mimaki. O teste empírico vai
confirmar se o FineCut aceita L-shape sem AITag. Se não aceitar, PR
futuro adiciona.

### 4. Duas variantes

- `Crop` (Konica): offset 3mm, comprimento 5mm, espessura 0.25pt.
- `MimakiTipo1` (OutTombo): offset 3mm, comprimento 10/15/25mm,
  espessura 1mm.

## Consequências

### Positivas
- Operador não adiciona marcas manualmente.
- Compatível com RasterLink e FineCut.
- Camada separada (visualmente na impressão).

### Negativas / Mitigações
- QDF manual é frágil. Mitigação: testes com PDFs reais.
- Sem AITag: FineCut pode exigir seleção manual. Aceitável (fluxo atual).

### Alternativas rejeitadas
- **AITag via Illustrator COM.** Dependência do Illustrator (PR futuro).
- **XGraphics (PdfSharp).** Achataria o PDF, perdendo OCG.

## Verificação

- Mesma posição nos arquivos de impressão e corte (se split).
- Teste no RasterLink + FineCut.

---

`source: docs/engineering/IMPOSICAO-MOTOR.md:§3` · `spikes/qpdf-csharp-imposition/RESULT.md`
