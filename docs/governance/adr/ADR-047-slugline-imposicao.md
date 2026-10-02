# ADR-047: Slugline de Imposição (Linha de Informação Técnica do Job)

- **Status:** Proposto
- **Data:** 2026-09-29
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / prepress
- **Links:** BR-010, BR-021; complementa ADR-040 (reservado, sem arquivo);
  observa ADR-041 (reservado, sem arquivo), ADR-043, ADR-044, ADR-015, ADR-021.

## Contexto

A **slugline** é o texto técnico de rodapé desenhado na margem de sangria da
chapa imposta, fora da área útil. Ela carrega, no mínimo:

- Nome do arquivo de trabalho.
- Data/hora de imposição.
- Dimensão do substrato.
- Grade (`cols` × `rows`).
- Quantidade total impressa.

É a informação que o operador da gráfica usa para identificar a chapa na mesa
e para o conciliador reconciliar a tiragem. Hoje não existe: o `AutoImposerCLI`
imprime a grade e as marcas de imposição (ADR-044) e nada mais.

O tema já estava reservado dentro de ADR-040 ("Marcas de imposição
(crop/registro/colorbar/**slugline** + overlay corte)"), mas nenhuma decisão de
contrato foi tomada. As marcas de corte (ADR-044) são desenhadas como content
stream vetorial no QDF e o `QdfPipeline` (ADR-043) hoje não escreve nenhuma
entrada `/Font` no catálogo — só operators de traço e separação de cor.

Restrições que moldam a decisão:

- `packages/imposition-core` é cálculo puro, sem IO e sem `PackageReference`.
- O golden-master do core (Regra 2 do `AGENTS.md` do pacote) não pode mudar.
- `AGENTS.md` da raiz proíbe commitar binários — logo, nenhuma fonte pode ser
  embutida no repositório.
- Mudança de contrato = ADR, sempre (Regra 6 do `AGENTS.md` do core).

## Decisão

### 1. Cálculo no core, em namespace novo — `Imposition.Core.Slugline`

`SluglineCalculator.Calculate(SluglineInput)` devolve o texto já formatado e a
posição de âncora, em milímetros, relativa à chapa. A slugline **não** vira
campo de `ImpositionInput`.

Motivo: a slugline é **decoração de saída**, não entrada do motor de grade.
Adicioná-la a `ImpositionInput` contaminaria o cálculo puro de grid e mexeria no
golden-master, que é lei (Regra 2 do `packages/imposition-core/AGENTS.md`).

**Divergência declarada em relação a `docs/PLAN-marcas-imposicao.md`:** o plano já
escopa a slugline em V1 (`:19`, `:73`) e prevê um `SlugLineRenderer.cs` em
`sidecars/AutoImposerCLI/Marks/` (`:131`, `:252`), com o risco R6 de transbordo
de margem (`:443`). Esta ADR move o **cálculo** para o core
(`SluglineCalculator`, em `Imposition.Core.Slugline`) e deixa a **escrita** no
`QdfPipeline`, junto do `MarksRenderer` já existente (ADR-044) — em vez de um
renderizador novo no sidecar. O risco R6 do plano não desaparece: é tratado pelo
truncamento da Decisão 2 e pelo aviso no `RESULT_JSON`.

### 2. Sem expansão do `MediaBox`

A slugline é **sobreposta** na margem de sangria que já existe na página imposta.
Se o texto não couber nessa faixa, ele é **truncado** — a geometria da página
não muda.

Esta decisão vale **somente quando `Marks != null`**: a margem de sangria é a
expansão calculada por `MarksRenderer.GetMarksExpansion(options.Marks)`
(`QdfPipeline.cs:27`), e com `Marks == null` essa expansão é `(0,0)`
(`MarksRenderer.cs:115-117`). Sem `--marks` não existe faixa de sangria onde a
slugline caiba.

Degradação declarada para `Marks == null`: `--slugline` **não** é erro e **não**
expande a página — a slugline é omitida, e a CLI registra a omissão no log e no
`RESULT_JSON`. Nunca silencioso, pelo mesmo motivo do ramo de fallback da
Decisão 6.

Motivo: expandir o `MediaBox` mudaria a geometria da chapa para todo consumidor
de `QdfPipeline`. O gabarito de corte é derivado das marcas de sangria
(ADR-044) — quem corta a chapa, na mesa ou no plotter, lê essas marcas. Ampliar
a página sem ampliar o gabarito quebra a concordância entre o PDF e a lâmina. A
slugline é decoração e tem de caber no espaço que já existe.

### 3. Fonte `/Helvetica` com `WinAnsiEncoding`, sem fonte embutida

A slugline é escrita usando a fonte base `/Helvetica` com `/WinAnsiEncoding`,
declarada no catálogo do QDF. Nenhum subset de fonte é embutido.

Motivo: o `QdfPipeline` não tem entrada `/Font` alguma hoje. Embutir
`/Type0` + `/Identity-H` exigiria um arquivo de fonte binário no repositório —
proibido pelo `AGENTS.md` da raiz ("não commitar binários"). `WinAnsiEncoding`
cobre latin-1, que cobre integralmente o PT-BR usado na slugline.

### 4. Preserva OCG

A escrita acontece como `BT … Tj ET` no content stream do QDF, no mesmo espaço
onde as marcas de corte (ADR-044) já são desenhadas. O catálogo de OCG não é
tocado.

Proibido usar PdfSharp para este fim: ele achata as camadas (ADR-043).

### 5. Contrato estendido — `ImposeOptions`

`ImposeOptions` ganha `Slugline? Slugline = null` como parâmetro opcional no
**final** do record posicional, depois de `MarksOptions? Marks = null`.

Motivo: parâmetro opcional com default mantém a **compatibilidade de fonte**
com todos os call sites existentes, que não precisam mudar uma linha:
`sidecars/AutoImposerCLI/Program.cs:411-421`, os testes em
`packages/imposition-pdf/tests/Imposition.Pdf.Tests/` e
`GraficaOS.Plugin/src/GraficaOS.Engine/Internal/ImpositionCoreAdapter.cs:88`.

**Não há compatibilidade binária.** C# não gera overload para parâmetro
opcional, e acrescentar o 11º parâmetro ao construtor primário do `record`
**remove** do ABI a assinatura de 10 argumentos. O consumidor binário que isso
atinge é o `GraficaOS.Engine` — ver a consequência negativa correspondente.

### 6. CLI — `--slugline <texto>`

`AutoImposerCLI` expõe `--slugline <texto>`. O recurso só liga quando há texto
não vazio; texto vazio ou ausente deixa o pipeline intocado.

No ramo de **fallback PdfSharp** (quando `qpdf.exe` não está disponível e o PDF
tem camadas), a slugline **não** é desenhada e a CLI emite aviso explícito no
`stderr`. Nunca silencioso: um rodapé ausente sem aviso é pior do que um rodapé
ausente declarado.

## Consequências

### Positivas

- Nenhum arquivo binário novo no repositório.
- Golden-master e `ImpositionInput` intactos — Regra 2 e Regra 4 do core preservadas.
- OCG preservado: a página imposta continua com as camadas do cliente.
- Geometria da página inalterada: quem corta a chapa não precisa reprocessar gabarito.
- Contrato aditivo **no código-fonte**: os call sites existentes continuam
  compilando sem alteração (ver a ressalva binária abaixo).
- Reaproveita o ponto de encaixe do `MarksRenderer` (ADR-044) em vez de criar um
  pipeline de texto paralelo.

### Negativas / Mitigações

- **Quebra binária no `GraficaOS.Engine` (consequência negativa da Decisão 5).**
  `GraficaOS.Engine` consome `Imposition.Pdf` por `HintPath`
  (`GraficaOS.Plugin/src/GraficaOS.Engine/GraficaOS.Engine.csproj:22-23`) contra o
  binário **versionado** `GraficaOS.Plugin/lib/Imposition.Pdf.dll` — não é
  `ProjectReference`. Como o 11º parâmetro apaga do ABI a assinatura de 10
  argumentos, o `GraficaOS.Engine.dll` já compilado estoura
  `MissingMethodException` em tempo de execução no
  `ImpositionCoreAdapter.cs:88` se a DLL não for regenerada junto. **Mitigação
  obrigatória e única:** a mesma PR que estende `ImposeOptions` tem de regenerar e
  versionar `GraficaOS.Plugin/lib/Imposition.Pdf.dll`. Um construtor-sobrecarga
  explícito de 10 argumentos foi considerado e **rejeitado** (ADR-047, ruling
  R-011): preservaria o ABI antigo, mas deixaria a API com duas formas de
  construir a mesma coisa e recompilaria os call sites de fonte na mesma PR de
  qualquer forma; a regeneração da DLL versionada resolve o consumidor binário sem
  custo adicional e é verificável no merge (R-011).
- **Glifos fora de latin-1 não são renderizados.** Consequência negativa
  explícita e aceita: com `/WinAnsiEncoding`, um `slugline` com caractere fora
  de latin-1 (cirílico, CJK, emoji) sai vazio ou com glifo ausente no RIP. O
  conteúdo da slugline é gerado pelo motor a partir de nome de arquivo, data,
  dimensões e grade — todos ASCII/latin-1 na prática. Mitigação: o
  `SluglineCalculator` deve devolver o texto já normalizado para latin-1, e a
  CLI deve avisar no `stderr` quando encontrar caractere não representável.
- **Truncamento silencioso visualmente.** Mitigação: o truncamento é declarado no
  log e deve aparecer no `RESULT_JSON` (mesmo espírito da regra R6 de
  `PLAN-marcas-imposicao.md`).
- **`/Helvetica` não é uma fonte de marca da casa.** Mitigação: aceito em V1; a
  troca por fonte corporativa fica para PR futuro com o binário de fonte
  resolvido fora do repositório.
- **Ramo PdfSharp perde a slugline.** Mitigação: aviso explícito no `stderr`,
  nunca omissão silenciosa.
- **QDF é frágil.** Mitigação: mesma estratégia de ADR-044 — testes com PDFs
  reais de cliente, incluindo um PDF com OCG.

### Alternativas rejeitadas

- **Campo `Slugline` em `ImpositionInput`.** Contaminaria o cálculo puro de
  grade e alteraria o golden-master. Regra 6 exigiria outra ADR para desfazer.
- **Expandir o `MediaBox` para caber a slugline.** Mudaria a geometria da página
  para todo consumidor de `QdfPipeline`.
- **Fonte embutida (`/Type0` + `/Identity-H` com subset).** Exige binário de
  fonte no repositório — proibido pelo `AGENTS.md` da raiz.
- **XGraphics (PdfSharp) para desenhar o texto.** Achata o OCG (ADR-043).
- **Renderer de texto do ImpositorKonica reaproveitado.** É WPF/Skia e vive em
  `sidecars/ImpositorKonica`; o motor headless não pode depender dele
  (ADR-015, ADR-021).

## Verificação

- Testes unitários em `Imposition.Core.Tests`: `SluglineCalculator.Calculate`
  com entradas conhecidas — texto formatado, âncora dentro da margem de
  sangria, truncamento quando o texto excede a faixa.
- Golden-master do core continua verde **sem alteração** (Regra 2): `19×34mm`
  em `665×986mm`, gap 0, margens 0, alvo 1015 cópias → `cols=35, rows=29,
  total=1015, orientation=0`.
- Teste em `Imposition.Pdf.Tests`: PDF com OCG gerado com `--slugline` mantém as
  camadas e contém a string esperada no content stream.
- Teste de integração no `AutoImposerCLI`: `--slugline "..."` produz PDF com o
  rodapé; sem a flag, nenhum operador `Tj` é adicionado.
- `GraficaOS.Plugin/lib/Imposition.Pdf.dll` regenerada e versionada na mesma PR:
  o `GraficaOS.Engine` compila e executa `ImpositionCoreAdapter.cs:88` contra a
  DLL nova, sem `MissingMethodException`.
- Plano de verificação por defeito: abrir o PDF imposto no RasterLink e
  confirmar a leitura da slugline e das marcas de corte na mesma chapa.

## Gatilhos para Reavaliação

- PDF de origem que já venha com sangria própria: a margem deixa de ser espaço
  livre e a âncora da Decisão 2 precisa ser re-derivada.
- RIP que rejeite `/Helvetica` não embutida, ou que exija fonte com métricas
  consistentes: a Decisão 3 cai e a slugline passa a depender de fonte corporativa.
- Ser decidida a fonte corporativa: `/WinAnsiEncoding` e a Decisão 3 saem, e a
  consequência negativa dos glifos fora de latin-1 desaparece junto.
- `qpdf.exe` deixar de estar disponível na máquina do operador: o caminho QDF
  some e a perda do ramo de fallback (Decisão 6) vira o caminho normal.
- `GraficaOS.Plugin/lib/Imposition.Pdf.dll` deixar de ser versionada e passar a
  `ProjectReference`: o custo binário da Decisão 5 cai para zero e a mitigação
  obrigatória deixa de ser exigida.

---

`source: sdd-superpowers-integration.md:§3 Opção A` · `docs/PLAN-marcas-imposicao.md` · `packages/imposition-pdf/src/Imposition.Pdf/Contracts/ImposeOptions.cs:4-14` · `packages/imposition-pdf/src/Imposition.Pdf/MarksRenderer.cs:21-109` · `sidecars/AutoImposerCLI/Program.cs:404-421`
