#target illustrator

function processarArquivoAutomatico(config) {
    var rawInput = (config.InputPath || "").replace(/\\/g, "/");
    var arquivoOrigem = new File(rawInput);
    if (!arquivoOrigem.exists) {
        throw new Error("Arquivo nao encontrado: " + config.InputPath);
    }

    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var doc = app.open(arquivoOrigem);

    try {
        var ptToMm = 25.4 / 72.0;
        var mmToPt = 72.0 / 25.4;

        // 1. Mapeamento dos vetores por camada nativa
        var itemsByLayer = {};
        var hasItems = false;

        for (var i = 0; i < doc.layers.length; i++) {
            var l = doc.layers[i];
            if (l.pageItems.length === 0) continue;

            itemsByLayer[l.name] = [];
            for (var p = 0; p < l.pageItems.length; p++) {
                itemsByLayer[l.name].push(l.pageItems[p]);
                hasItems = true;
            }
        }

        if (!hasItems) throw new Error("Nenhum vetor encontrado no arquivo.");

        // Tamanho da peca = tamanho do arquivo enviado (prancha original / mascara / MediaBox).
        // NAO usar o bounding box dos itens: links colocados podem estourar alem da mascara
        // e inflar o tamanho calculado.
        var abRef = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var artRect = abRef.artboardRect; // [left, top, right, bottom] em pt
        var refLeftPt = artRect[0];
        var refTopPt = artRect[1];
        var pageWpt = artRect[2] - artRect[0];
        var pageHpt = artRect[1] - artRect[3];

        if (pageWpt <= 0 || pageHpt <= 0)
            throw new Error("Prancheta invalida: [" + artRect.join(", ") + "]");

        var pieceWidthMm = pageWpt * ptToMm;
        var pieceHeightMm = pageHpt * ptToMm;

        var marginSideMm = (config.MarginSideMm !== undefined && config.MarginSideMm !== null) ? config.MarginSideMm : 15;
        var marginTopMm = (config.MarginTopMm !== undefined && config.MarginTopMm !== null) ? config.MarginTopMm : 15;
        var gapMm = (config.GapMm !== undefined && config.GapMm !== null) ? config.GapMm : 2;
        var utilWidthMm = Math.max(10, config.SheetWMm - (2 * marginSideMm));

        // Decisão Automática de Rotação (se não forçada pelo usuário)
        // Epsilon de 1e-6 evita perder 1 coluna/linha por arredondamento de ponto flutuante
        // (ex.: peca de 19.0000000001mm -> 665/19.0000000001 = 34.999... -> floor daria 34)
        if (config.Rotacionar90 === null || config.Rotacionar90 === undefined) {
            var cols0 = Math.floor((utilWidthMm + gapMm) / (pieceWidthMm + gapMm) + 0.000001);
            var cols90 = Math.floor((utilWidthMm + gapMm) / (pieceHeightMm + gapMm) + 0.000001);
            config.Rotacionar90 = (cols90 > cols0 && cols90 > 0);
        }

        // Rotação em 90° se requisitada
        if (config.Rotacionar90) {
            for (var lName in itemsByLayer) {
                var lItems = itemsByLayer[lName];
                for (var it = 0; it < lItems.length; it++) {
                    lItems[it].rotate(90, true, true, true, true, Transformation.CENTER);
                }
            }
        }

        // Pegada da peca pos-rotacao = prancha original rotacionada 90° (respeitando a mascara/arquivo)
        var piecePageWpt = config.Rotacionar90 ? pageHpt : pageWpt;
        var piecePageHpt = config.Rotacionar90 ? pageWpt : pageHpt;
        var footprintLeftPt = config.Rotacionar90
            ? (refLeftPt + ((pageWpt - pageHpt) / 2.0))
            : refLeftPt;
        var footprintTopPt = config.Rotacionar90
            ? (refTopPt - ((pageWpt + pageHpt) / 2.0))
            : refTopPt;

        var finalPieceWMm = piecePageWpt * ptToMm;
        var finalPieceHMm = piecePageHpt * ptToMm;

        // CÁLCULO AUTOMÁTICO DE COLUNAS COM MOTOR DE FATORES EXATOS
        var maxPossibleCols = Math.floor((utilWidthMm + gapMm) / (finalPieceWMm + gapMm) + 0.000001);
        if (maxPossibleCols < 1) maxPossibleCols = 1;

        var targetCopies = config.TargetCopies || 1;

        if (!config.Cols || config.Cols <= 0) {
            // Busca se existe divisão exata entre maxPossibleCols e maxPossibleCols - 10
            var chosenCols = maxPossibleCols;
            for (var c = maxPossibleCols; c >= Math.max(1, maxPossibleCols - 10); c--) {
                if (targetCopies % c === 0) {
                    chosenCols = c;
                    break;
                }
            }
            config.Cols = chosenCols;
        }

        if (!config.Rows || config.Rows <= 0) {
            config.Rows = Math.ceil(targetCopies / config.Cols);
            if (config.Rows < 1) config.Rows = 1;
        }

        // CÁLCULO E EXTENSÃO AUTOMÁTICA DA PRANCHETA (COMPRIMENTO)
        var requiredHeightMm = (config.Rows * finalPieceHMm) + ((config.Rows - 1) * gapMm) + (2 * marginTopMm);
        if (!config.SheetHMm || config.SheetHMm < requiredHeightMm) {
            config.SheetHMm = Math.ceil(requiredHeightMm);
        }

        // 2. Redimensiona Prancheta para a chapa ou rolo
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        ab.artboardRect = [0, 0, config.SheetWMm * mmToPt, -(config.SheetHMm * mmToPt)];

        // Centraliza a grade na largura da prancheta
        var gradeWMm = (config.Cols * finalPieceWMm) + ((config.Cols - 1) * gapMm);
        var startXPt = (marginSideMm + ((utilWidthMm - gradeWMm) / 2.0)) * mmToPt;
        var startYPt = -(marginTopMm * mmToPt);

        var deltaX = startXPt - footprintLeftPt;
        var deltaY = startYPt - footprintTopPt;

        for (var lName in itemsByLayer) {
            var lItems = itemsByLayer[lName];
            for (var it = 0; it < lItems.length; it++) {
                lItems[it].translate(deltaX, deltaY);
            }
        }

        // 5. Multiplicação mantendo Faca, Cor e Branco separados
        var stepXPt = piecePageWpt + (gapMm * mmToPt);
        var stepYPt = piecePageHpt + (gapMm * mmToPt);
        var geradas = 1;
        var maxCopias = config.TargetCopies || (config.Cols * config.Rows);

        for (var r = 0; r < config.Rows; r++) {
            if (geradas >= maxCopias && (geradas % config.Cols === 0)) {
                break;
            }

            for (var c = 0; c < config.Cols; c++) {
                if (r === 0 && c === 0) continue;

                if (geradas >= maxCopias && (geradas % config.Cols === 0)) {
                    break;
                }

                var offX = c * stepXPt;
                var offY = -(r * stepYPt);

                for (var layerName in itemsByLayer) {
                    if (!itemsByLayer.hasOwnProperty(layerName)) continue;
                    var layerItems = itemsByLayer[layerName];
                    var targetLayer = doc.layers.getByName(layerName);

                    for (var k = 0; k < layerItems.length; k++) {
                        var dup = layerItems[k].duplicate(targetLayer, ElementPlacement.PLACEATEND);
                        dup.translate(offX, offY);
                    }
                }
                geradas++;
            }
        }

        // 6. Salva arquivo imposto em PDF
        var rawOutput = (config.OutputPath || "").replace(/\\/g, "/");
        var arquivoDestino = new File(rawOutput);
        var pdfOptions = new PDFSaveOptions();
        pdfOptions.compatibility = PDFCompatibility.ACROBAT8;
        pdfOptions.preserveEditability = true;
        doc.saveAs(arquivoDestino, pdfOptions);

        // 7. Decide se mantém aberto na tela ou se fecha
        if (config.ManterAberto) {
            doc.views[0].zoom = 0.35;
            app.redraw();
            try { app.activate(); } catch (_) {}
        } else {
            doc.close(SaveOptions.DONOTSAVECHANGES);
        }

        return '{"success":true,"cols":' + config.Cols + ',"rows":' + config.Rows + ',"copies":' + geradas + ',"sheetWMm":' + config.SheetWMm + ',"sheetHMm":' + config.SheetHMm + ',"pieceWMm":' + pieceWidthMm.toFixed(2) + ',"pieceHMm":' + pieceHeightMm.toFixed(2) + ',"origArtboardWMm":' + (pageWpt * ptToMm).toFixed(2) + ',"origArtboardHMm":' + (pageHpt * ptToMm).toFixed(2) + ',"outputPath":"' + rawOutput + '"}';

    } catch (e) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {}
        throw e;
    } finally {
        app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    }
}
