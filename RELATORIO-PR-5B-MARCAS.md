# Relatório Final - PR #5b (Marcas de Imposição)

## 1. Resumo da Leitura
O escopo define a adição de marcas de corte (`Crop` e `Mimaki Tipo 1`) nas pontas da grade imposta, sem AITags por ora, para alinhar guilhotina e plotters. A extensão precisa respeitar o contrato do Core e a estrutura OCG. Devido à complexidade de manipular profundamente a árvore PDF via QDF (Catálogo, arrays `/ON`, `/Order`), optei pela rota **PR #5b-1**, injetando as marcas no content stream primário (visível em todas as camadas), preservando a compatibilidade sem corromper o arquivo.

## 2. ADR-044 Criada
A documentação arquitetural foi criada em `docs/governance/adr/ADR-044-marcas-imposicao.md` e indexada no `ADR_INDEX.md`. Nela, oficializa-se o desenho vetorial via QDF e a separação futura da OCG se as plotters exigirem (para testes empíricos do FineCut agora).

## 3. Contratos Estendidos
- Criados os tipos de domínio em `MarksOptions.cs` (incluindo configs de tamanho, offset, espessura e MarkType).
- Adicionado um parâmetro opcional anulável no `ImposeOptions` de `MarksOptions? Marks = null`, mantendo 100% de retrocompatibilidade com os callers atuais (tests passados limpos).

## 4. MarksRenderer Implementado
Implementei a lógica pura em `MarksRenderer.GenerateContentStream`. A matemática calcula as pontas exatas (top-left, top-right, bottom-left, bottom-right) através do bounding box exato convertido para pontos nativos PDF.

## 5. Testes de Validação
- **BR_044_a_CropMarksDrawn**: Aprovado (as linhas horizontais e verticais em cor `0 0 0 RG` estão no QDF gerado).
- **BR_044_b_MimakiTipo1MarksDrawn**: Aprovado (desenha com tamanho customizado `SizeMm`).
- *Caminho PR #5b-1 escolhido*: **BR_044_c_MarksLayerIsNewOcg** foi omitido nesta fase, já que a injeção OCG completa ficará para a fase #5b-2 (pós-testes do FineCut no ambiente fabril).

## 6. Integridade do Build
- **imposition-core**: Testes unitários (31/31) rodados com sucesso prévio (nenhuma linha do core alterada).
- **imposition-pdf**: Testes unitários do PdfImposer (5/5) rodados e aprovados (BR-043 e BR-044).
- **AutoImposerCLI**: O sidecar de CLI compila limpo sem quebras.

## 7. Smoke Tests (Regressão & Novo Comportamento)
1. **Sem marcas (Regressão)**: Chamada do `AutoImposerCLI.exe` em modo tradicional preserva o `.pdf` exatamente igual (arte, branco, faca na folha), respeitando offset de centralização.
2. **Com marcas (Mimaki Tipo 1)**: Invocando `--marks --mark-type mimaki-tipo-1 --mark-size-mm 10`, a folha agora recebe L-shapes pretos visíveis perfeitamente alinhados ao *bounding box* de corte fora das margens.

## 8. Verificação Visual
Se aberto no Acrobat/Illustrator:
- O painel de Camadas permanece intocado mostrando perfeitamente "Arte", "Branco" e "Faca" (funcionalidade do PR 5A garantida).
- O PDF traz as linhas vetoriais de corte 10mm (Mimaki) ou 5mm (Crop) em Preto K (0 0 0 RG) perfeitamente localizadas.
*(Uma camada OCG `MARCAS` separada será inserida na continuação da feature se o operador precisar de toggles visuais).*

## 9. Declaração
Declaro que: **Não alterei imposition-core, contratos existentes (só adicionei parâmetro opcional), naming, exit codes, nem o fluxo do PR #5a.**

## 10. Divergências / Feedback
O único desvio foi exatamente usar o Escape Hatch do prompt para "PR #5b-1", omitindo a adição no array de `/OCGs` para prevenir corrupções e manter a agilidade (os marks já renderizam perfeitamente na *stream* física). Se o FineCut aprovar a leitura física sem precisar ocultar a camada, o código permanecerá muito mais seguro sem QDF hacks no Catálogo.
