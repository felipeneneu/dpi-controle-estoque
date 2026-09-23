#target illustrator

function executeImposition(plan) {
    var rawInput = (plan.InputPath || "").replace(/\\/g, "/");
    var arquivoOrigem = new File(rawInput);
    if (!arquivoOrigem.exists) {
        throw new Error("Arquivo nao encontrado: " + plan.InputPath);
    }

    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var doc = app.open(arquivoOrigem);

    try {
        var mmToPt = 72.0 / 25.4;

        // 1. Mapeamento dos vetores por camada nativa (preserva camadas Faca, Cor, Branco, etc.)
        var itemsByLayer = {};
        var hasItems = false;

        for (var i = 0; i < doc.layers.length; i++) {
            var l = doc.layers[i];
            l.locked = false;
            l.visible = true;
            if (l.pageItems.length === 0) continue;

            itemsByLayer[l.name] = [];
            for (var p = 0; p < l.pageItems.length; p++) {
                try { l.pageItems[p].locked = false; } catch (_) {}
                itemsByLayer[l.name].push(l.pageItems[p]);
                hasItems = true;
            }
        }

        if (!hasItems) throw new Error("Nenhum vetor encontrado no arquivo.");

        var abRef = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var artRect = abRef.artboardRect;
        var refLeftPt = artRect[0];
        var refTopPt = artRect[1];
        var pageWpt = artRect[2] - artRect[0];
        var pageHpt = artRect[1] - artRect[3];

        if (pageWpt <= 0 || pageHpt <= 0)
            throw new Error("Prancheta invalida: [" + artRect.join(", ") + "]");

        // 2. Rotacao em 90 graus se requisitada pelo motor Core (em torno do centro da prancheta original)
        if (plan.rotacionar90) {
            var origCenterX = refLeftPt + (pageWpt / 2.0);
            var origCenterY = refTopPt - (pageHpt / 2.0);

            var rotMatrix = app.getIdentityMatrix();
            rotMatrix = app.concatenateTranslationMatrix(rotMatrix, -origCenterX, -origCenterY);
            rotMatrix = app.concatenateRotationMatrix(rotMatrix, 90);
            rotMatrix = app.concatenateTranslationMatrix(rotMatrix, origCenterX, origCenterY);

            for (var lName in itemsByLayer) {
                var lItems = itemsByLayer[lName];
                for (var it = 0; it < lItems.length; it++) {
                    try {
                        lItems[it].transform(rotMatrix, true, true, true, true, 100.0, Transformation.DOCUMENTORIGIN);
                    } catch (_) {
                        lItems[it].rotate(90, true, true, true, true, Transformation.CENTER);
                    }
                }
            }
        }

        // Ponto Top-Left da pegada da peca apos a rotacao de 90°
        var footprintLeftPt = plan.rotacionar90
            ? (refLeftPt + ((pageWpt - pageHpt) / 2.0))
            : refLeftPt;
        var footprintTopPt = plan.rotacionar90
            ? (refTopPt + ((pageWpt - pageHpt) / 2.0))
            : refTopPt;

        // 3. Redimensiona prancheta conforme plano exato do Core
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        ab.artboardRect = [0, 0, plan.artboardWMm * mmToPt, -(plan.artboardHMm * mmToPt)];

        // 4. Posiciona itens de origem nas coordenadas calculadas pelo Core
        var deltaX = plan.startXPt - footprintLeftPt;
        var deltaY = plan.startYPt - footprintTopPt;

        for (var lName in itemsByLayer) {
            var lItems = itemsByLayer[lName];
            for (var it = 0; it < lItems.length; it++) {
                lItems[it].translate(deltaX, deltaY);
            }
        }

        // 5. Multiplica pecas respeitando plano (cols, rows, plannedUnits) mantendo camadas
        var geradas = 1;
        var maxCopias = plan.plannedUnits;

        for (var r = 0; r < plan.rows; r++) {
            if (geradas >= maxCopias) break;

            for (var c = 0; c < plan.cols; c++) {
                if (r === 0 && c === 0) continue;
                if (geradas >= maxCopias) break;

                var offX = c * plan.stepXPt;
                var offY = -(r * plan.stepYPt);

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

        // 5b. Desenho de moldura para FineCut (Mimaki) na camada dedicada FineCut_Moldura
        var finecutFrame = (plan.finecutFrame !== undefined) ? plan.finecutFrame : plan.FineCutFrame;
        if (finecutFrame) {
            var molduraLayer;
            try {
                molduraLayer = doc.layers.getByName("FineCut_Moldura");
            } catch (_) {
                molduraLayer = doc.layers.add();
                molduraLayer.name = "FineCut_Moldura";
            }
            molduraLayer.locked = false;
            molduraLayer.visible = true;

            var rectTop = plan.startYPt;
            var rectLeft = plan.startXPt;
            var rectWidth = plan.gradeWMm * mmToPt;
            var rectHeight = plan.gradeHMm * mmToPt;

            var frameRect = molduraLayer.pathItems.rectangle(rectTop, rectLeft, rectWidth, rectHeight);
            frameRect.filled = false;
            frameRect.stroked = true;
            frameRect.strokeWidth = 0.25;

            if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
                var strokeCmyk = new CMYKColor();
                strokeCmyk.cyan = 0;
                strokeCmyk.magenta = 0;
                strokeCmyk.yellow = 0;
                strokeCmyk.black = 100;
                frameRect.strokeColor = strokeCmyk;
            } else {
                var strokeRgb = new RGBColor();
                strokeRgb.red = 0;
                strokeRgb.green = 0;
                strokeRgb.blue = 0;
                frameRect.strokeColor = strokeRgb;
            }
        }

        // 6. Salva PDF imposto
        var rawOutput = (plan.outputPath || plan.OutputPath || "").replace(/\\/g, "/");
        var arquivoDestino = new File(rawOutput);
        var pdfOptions = new PDFSaveOptions();
        pdfOptions.compatibility = PDFCompatibility.ACROBAT8;
        pdfOptions.preserveEditability = true;
        doc.saveAs(arquivoDestino, pdfOptions);

        // 7. Modo bancada vs silencioso
        var manter = (plan.manterAberto !== undefined) ? plan.manterAberto : plan.ManterAberto;
        if (manter) {
            doc.views[0].zoom = 0.35;
            app.redraw();
            try { app.activate(); } catch (_) {}
        } else {
            doc.close(SaveOptions.DONOTSAVECHANGES);
        }

        return '{"success":true,"cols":' + plan.cols + ',"rows":' + plan.rows + ',"copies":' + geradas + ',"gridHash":"' + (plan.gridHash || "") + '","sheetWMm":' + plan.artboardWMm + ',"sheetHMm":' + plan.artboardHMm + ',"pieceWMm":' + plan.pieceWMm + ',"pieceHMm":' + plan.pieceHMm + ',"finecutFrame":' + (finecutFrame ? "true" : "false") + ',"outputPath":"' + rawOutput + '"}';

    } catch (e) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {}
        throw e;
    } finally {
        app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    }
}
