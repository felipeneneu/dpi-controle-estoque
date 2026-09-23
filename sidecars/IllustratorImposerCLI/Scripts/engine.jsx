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
            if (l.pageItems.length === 0) continue;

            itemsByLayer[l.name] = [];
            for (var p = 0; p < l.pageItems.length; p++) {
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

        // 2. Rotacao em 90 graus se requisitada pelo motor Core
        if (plan.rotacionar90) {
            for (var lName in itemsByLayer) {
                var lItems = itemsByLayer[lName];
                for (var it = 0; it < lItems.length; it++) {
                    lItems[it].rotate(90, true, true, true, true, Transformation.CENTER);
                }
            }
        }

        var footprintLeftPt = plan.rotacionar90
            ? (refLeftPt + ((pageWpt - pageHpt) / 2.0))
            : refLeftPt;
        var footprintTopPt = plan.rotacionar90
            ? (refTopPt - ((pageWpt + pageHpt) / 2.0))
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
            if (geradas >= maxCopias && (geradas % plan.cols === 0)) {
                break;
            }

            for (var c = 0; c < plan.cols; c++) {
                if (r === 0 && c === 0) continue;

                if (geradas >= maxCopias && (geradas % plan.cols === 0)) {
                    break;
                }

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

        // 6. Salva PDF imposto
        var rawOutput = (plan.OutputPath || "").replace(/\\/g, "/");
        var arquivoDestino = new File(rawOutput);
        var pdfOptions = new PDFSaveOptions();
        pdfOptions.compatibility = PDFCompatibility.ACROBAT8;
        pdfOptions.preserveEditability = true;
        doc.saveAs(arquivoDestino, pdfOptions);

        // 7. Modo bancada vs silencioso
        if (plan.manterAberto) {
            doc.views[0].zoom = 0.35;
            app.redraw();
            try { app.activate(); } catch (_) {}
        } else {
            doc.close(SaveOptions.DONOTSAVECHANGES);
        }

        return '{"success":true,"cols":' + plan.cols + ',"rows":' + plan.rows + ',"copies":' + geradas + ',"gridHash":"' + (plan.gridHash || "") + '","sheetWMm":' + plan.artboardWMm + ',"sheetHMm":' + plan.artboardHMm + ',"pieceWMm":' + plan.pieceWMm + ',"pieceHMm":' + plan.pieceHMm + ',"outputPath":"' + rawOutput + '"}';

    } catch (e) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {}
        throw e;
    } finally {
        app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    }
}
