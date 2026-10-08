# ADR-060: Contrato de Integridade Estrutural de Grafo de Objetos na Exportação PDF/X-1a (Form XObject Incremental Viewport)

> **Status:** Aprovado  
> **Data:** 2026-10-08  
> **Autor:** Engenharia GraficaOS  
> **Domínio:** imposition / prepress / export  
> **Regra de Negócio:** BR-055  
> **Complementa/Substitui:** Substitui a estratégia de extração isolada da ADR-054; Aplica Regras R-009, R-013, R-020, R-021, R-022, R-023  

---

## 1. Contexto

Durante testes industriais em 2026-10-07/08 com arquivos PDF de comunicação visual reais (~800 KB):
1. O exportador `QdfPanelSplitter` gerava painéis fatiados de apenas **1.824 bytes**, independentemente do tamanho e complexidade do arquivo fonte.
2. Ao serem abertos em softwares gráficos e RIPs (Acrobat, Illustrator, Caldera, Onyx), os painéis renderizavam páginas em branco ou apontavam erro fatal de "objeto ausente".
3. **Causa Raiz:** O algoritmo anterior copiava a string literal do dicionário `/Resources` para a página gerada, mas omitia todos os objetos indiretos referenciados (`/XObject`, fontes CIDFont, perfis ICC, patterns, etc.) e não emitia entradas na tabela `xref`.
4. Uma abordagem de travessia recursiva do grafo de objetos (object graph traversal) em PDF apresenta risco proibitivo de quebra sutil de fontes complexas, shadings, ExtGState, dicionários cíclicos e descompressão corruptiva de streams DCT/Flate.

---

## 2. Decisões

### Decisão 1: Preservação Verbatim por Clone Integral e Byte-Identity (Regra R-022)
- O fatiador preserva integralmente os bytes do arquivo fonte do offset `0` ao `sourceLength`.
- Streams comprimidos (imagens DCTDecode, vetores FlateDecode, tabelas de fontes TrueType/Type0) **nunca** são descomprimidos ou recompactados. Mantêm-se bit-a-bit idênticos aos criados pelo cliente.

### Decisão 2: Encapsulamento em Form XObject com Translação na Origem `(0,0)`
- A página original é convertida em um Form XObject (`/FmOriginal`), cujo `/BBox` compreende as dimensões físicas completas da arte original (`[0 0 sourceWPt sourceHPt]`).
- Cada painel é emitido com sua própria `/Page` normalizada na origem `(0, 0)`:
  - `/MediaBox [0 0 panelWPt panelHPt]`
  - `/CropBox [0 0 panelWPt panelHPt]`
- A arte é posicionada na página do painel aplicando a matriz de translação antes de invocar o Form:
  ```pdf
  q
  1 0 0 1 -cropXPt -cropYPt cm
  /FmOriginal Do
  Q
  ```
- Elementos visuais adicionais (linha-guia de emenda de ADR-051/ADR-059) são desenhados diretamente no content stream em coordenadas locais do painel `[0..panelWPt, 0..panelHPt]`.

### Decisão 3: Numeração Canônica Segura via `/Size` do Trailer
- A alocação de novos IDs de objetos nunca realiza varredura por expressões regulares no binário (evitando falsos positivos dentro de fluxos JPEG/ICC).
- O maior ID original é extraído a partir do campo `/Size` do trailer final do documento (`maxId = Size - 1`).
- Os novos objetos alocados recebem IDs a partir de `maxId + 1`, e o novo trailer atualiza `/Size = Math.Max(origSize, lastNewObjId + 1)`.

### Decisão 4: Form XObject Wrapper para Múltiplos Streams de Conteúdo
- Se `/Contents` for uma referência indireta a stream único (`N 0 R`), o stream é clonado verbatim no `/FmOriginal`.
- Se `/Contents` for um array de múltiplos streams (`[14 0 R 15 0 R ...]`), é gerado um sub-form para cada stream e o `/FmOriginal` funciona como container chamando sequencialmente `q /SubFm1 Do ... /SubFmK Do Q`. Zero merge destrutivo de streams compactados.

### Decisão 5: Resolução de Recursos e Propriedades via Hierarquia `/Parent` (Regra R-023)
- Recursos como `/Resources`, `/MediaBox`, `/CropBox` e `/Rotate` podem residir no nó da folha `/Page` ou em qualquer nó ancestral `/Pages`.
- O resolver percorre a cadeia `/Parent` ascendentemente até localizar os atributos.

### Decisão 6: Descarte de `/OutputIntents` do Source e Injeção Canônica FOGRA39 (ADR-054)
- Quaisquer dicionários `/OutputIntents` originais do arquivo fonte são descartados na nova raiz `/Catalog` gerada.
- O perfil FOGRA39 padronizado e conforme PDF/X-1a:2001 é injetado pelo pipeline estabelecido na ADR-054 (`PdfxOutputIntentInjector`).

### Decisão 7: Validação Cruzada Obrigatória com `PDFtoImage` / PDFium (Regra R-021)
- O pipeline de testes automatizados valida cada painel com o motor `PDFtoImage` v5.4.0 (PDFium, Apache 2.0).
- São executadas 5 validações obrigatórias:
  1. Tamanho em disco > 100 KB (combate ao bug de 1.8 KB).
  2. Abertura pelo PDFium sem exceções de sintaxe.
  3. Conformidade geométrica de largura e altura.
  4. Renderização comprovadamente não-branca (presença efetiva de pixels da arte).
  5. Byte-identity verificado via streaming por chunks de 1 MB (`source[0..len] == panel[0..len]`).

### Decisão 8: Pré-Vôo Estrito (Fail-Fast)
- Rejeição imediata antes de IO nos seguintes cenários:
  - Presença de camadas (`/OCProperties`) -> `ErrorCodes.SourceHasOcg`
  - Cores RGB (`/DeviceRGB`, operadores `rg`/`RG`, ICC de 3 canais) -> `ErrorCodes.ExportSourceNotCmyk`
  - Arquivos multi-página (`/Count > 1`) -> `E_PDF_MULTI_PAGE_UNSUPPORTED`
  - Transparência não-achatada (`/Group` com `/S /Transparency`) -> `E_PDF_TRANSPARENCY_UNSUPPORTED`
  - Unidade de usuário não-unitária (`/UserUnit != 1.0`) -> `E_PDF_USERUNIT_UNSUPPORTED`
  - Trailer malformado sem `/Size` -> `E_PDF_INVALID_TRAILER`

### Decisão 9: Armazenamento e Trade-Off de Tamanho
- Em decorrência do clone integral com append incremental (ISO 32000), cada arquivo de painel gerado possui tamanho mínimo equivalente ao documento fonte original mais a estrutura de páginas do painel (~5-10 KB).
- O motor CLI monitora os arquivos e, caso algum painel exceda 500 MB, emite aviso explícito em `stderr` e registra em warnings.

---

## 3. Consequências

- **Positivas:**
  - Elimina completamente o bug estrutural de painéis vazios de 1.8 KB.
  - Fidelidade 100% de rasterização em RIPs comerciais (Fiery, Caldera, Onyx, Harlequin) graças à origem `(0, 0)` e `/MediaBox` exato do painel.
  - Imagens, fontes embutidas, curvas e perfis mantêm integridade de nível binário.
- **Trade-Offs Aceitos:**
  - O tamanho do arquivo em disco de cada painel é proporcional ao arquivo fonte (mitigação futura via smart trim de objetos órfãos).
