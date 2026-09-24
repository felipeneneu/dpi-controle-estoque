#target illustrator

// ── GraficaOS Imposer — impose.jsx ──
// Ponte ExtendScript (ES3) entre o painel CEP e o motor COM (.NET).
// Todas as funções recebem/retornam strings JSON.

var _engine = null;

// ── Instância COM (singleton por sessão) ────────────────────────────

function getEngine() {
    if (_engine !== null) return _engine;
    try {
        _engine = new ActiveXObject("GraficaOS.Engine");
        return _engine;
    } catch (e) {
        throw new Error("Motor GraficaOS nao registrado. Reinstale o plugin. Detalhe: " + e.message);
    }
}

// ── Funções chamadas pelo painel CEP ────────────────────────────────

function getEngineVersion() {
    try {
        return getEngine().GetVersion();
    } catch (e) {
        return '{"success":false,"errorCode":"E_COM","message":"' + escapeJson(e.message) + '"}';
    }
}

function getActiveTenant() {
    try {
        return getEngine().GetActiveTenant();
    } catch (e) {
        return '{"success":false,"errorCode":"E_COM","message":"' + escapeJson(e.message) + '"}';
    }
}

function planImposition(json) {
    try {
        return getEngine().PlanImposition(json);
    } catch (e) {
        return '{"success":false,"errorCode":"E_COM","message":"' + escapeJson(e.message) + '"}';
    }
}

function imposeToPdf(json) {
    try {
        return getEngine().ImposeToPdf(json);
    } catch (e) {
        return '{"success":false,"errorCode":"E_COM","message":"' + escapeJson(e.message) + '"}';
    }
}

function applyPlanToDocument(json) {
    try {
        var resultJson = getEngine().ApplyPlanToDocument(json);
        var result = parseJson(resultJson);

        if (!result.success) return resultJson;
        if (!result.placements || result.placements.length === 0) {
            return '{"success":false,"errorCode":"E_NO_PLACEMENTS","message":"Plano sem posicoes."}';
        }

        applyPlacementsToActiveDoc(result);
        drawFineCutFrame(result);

        return resultJson;
    } catch (e) {
        return '{"success":false,"errorCode":"E_APPLY","message":"' + escapeJson(e.message) + '"}';
    }
}

function trackEvent(json) {
    try {
        getEngine().TrackEvent(json);
    } catch (e) {
        // Telemetria é best-effort — nunca lança erro
    }
}

function flushTelemetry() {
    try {
        return getEngine().FlushTelemetry();
    } catch (e) {
        return '{"success":false,"errorCode":"E_COM","message":"' + escapeJson(e.message) + '"}';
    }
}

function pickPdfFile() {
    try {
        var f = File.openDialog("Selecionar PDF", "*.pdf");
        if (f === null) return '{"path":null}';
        return '{"path":"' + escapeJson(f.fsName.replace(/\\/g, "/")) + '"}';
    } catch (e) {
        return '{"path":null,"error":"' + escapeJson(e.message) + '"}';
    }
}

// ── Aplicar imposição no documento ativo ────────────────────────────

function applyPlacementsToActiveDoc(plan) {
    var mm2pt = 72.0 / 25.4;

    // 1. Verificar seleção
    if (app.documents.length === 0) {
        throw new Error("Nenhum documento aberto no Illustrator.");
    }
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || sel.length === 0) {
        throw new Error("Selecione um objeto na bancada antes de impor.");
    }

    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    try {
        // 2. Mapear itens selecionados por camada
        var itemsByLayer = {};
        var hasItems = false;
        for (var i = 0; i < sel.length; i++) {
            var item = sel[i];
            var layerName = item.layer.name;
            if (!itemsByLayer[layerName]) {
                itemsByLayer[layerName] = [];
            }
            itemsByLayer[layerName].push(item);
            hasItems = true;
        }

        if (!hasItems) {
            throw new Error("Nenhum item selecionado.");
        }

        // 3. Pegar referência da posição original dos itens
        var firstItem = sel[0];
        var origLeft = firstItem.left;
        var origTop = firstItem.top;

        // 4. Redimensionar prancheta conforme plano do motor
        var sheetW = plan.sheet.widthMm * mm2pt;
        var sheetH = plan.sheet.heightMm * mm2pt;
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        ab.artboardRect = [0, 0, sheetW, -sheetH];

        // 5. Mover originais para o primeiro placement
        var p0 = plan.placements[0];
        var targetX = p0.xMm * mm2pt;
        var targetY = -(p0.yMm * mm2pt);
        var deltaX = targetX - origLeft;
        var deltaY = targetY - origTop;

        for (var lName in itemsByLayer) {
            if (!itemsByLayer.hasOwnProperty(lName)) continue;
            var items = itemsByLayer[lName];
            for (var j = 0; j < items.length; j++) {
                items[j].translate(deltaX, deltaY);
            }
        }

        // 6. Rotação se necessário (primeiro placement)
        if (p0.rotated) {
            for (var lName2 in itemsByLayer) {
                if (!itemsByLayer.hasOwnProperty(lName2)) continue;
                var items2 = itemsByLayer[lName2];
                for (var k = 0; k < items2.length; k++) {
                    items2[k].rotate(-90, true, true, true, true, Transformation.CENTER);
                }
            }
        }

        // 7. Duplicar para cada placement restante
        var maxCopias = plan.grid.plannedUnits;
        var geradas = 1;

        for (var pi = 1; pi < plan.placements.length; pi++) {
            if (geradas >= maxCopias) break;

            var p = plan.placements[pi];
            var pxPt = p.xMm * mm2pt;
            var pyPt = -(p.yMm * mm2pt);
            var offX = pxPt - targetX;
            var offY = pyPt - targetY;

            for (var ln in itemsByLayer) {
                if (!itemsByLayer.hasOwnProperty(ln)) continue;
                var layerItems = itemsByLayer[ln];
                var targetLayer = doc.layers.getByName(ln);

                for (var li = 0; li < layerItems.length; li++) {
                    var dup = layerItems[li].duplicate(targetLayer, ElementPlacement.PLACEATEND);
                    dup.translate(offX, offY);

                    // Rotação diferencial
                    if (p.rotated && !p0.rotated) {
                        dup.rotate(-90, true, true, true, true, Transformation.CENTER);
                    } else if (!p.rotated && p0.rotated) {
                        dup.rotate(90, true, true, true, true, Transformation.CENTER);
                    }
                }
            }
            geradas++;
        }

        // 8. Zoom para visualizar
        doc.views[0].zoom = 0.35;
        app.redraw();

    } finally {
        app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    }
}

// ── Moldura FineCut ─────────────────────────────────────────────────

function drawFineCutFrame(plan) {
    var mm2pt = 72.0 / 25.4;
    var doc = app.activeDocument;

    // Criar/limpar camada FineCut_Moldura
    var molduraLayer;
    try {
        molduraLayer = doc.layers.getByName("FineCut_Moldura");
        // Limpar itens existentes
        while (molduraLayer.pageItems.length > 0) {
            molduraLayer.pageItems[0].remove();
        }
    } catch (e) {
        molduraLayer = doc.layers.add();
        molduraLayer.name = "FineCut_Moldura";
    }
    molduraLayer.locked = false;
    molduraLayer.visible = true;

    // Calcular dimensões da grade útil
    var grid = plan.grid;
    var placements = plan.placements;
    if (!placements || placements.length === 0) return;

    // Bounding box da grade: do primeiro ao último placement
    var p0 = placements[0];
    var pLast = placements[placements.length - 1];
    var minX = p0.xMm;
    var minY = p0.yMm;
    var maxX = pLast.xMm + pLast.widthMm;
    var maxY = pLast.yMm + pLast.heightMm;

    // Percorrer todos para achar min/max real
    for (var i = 0; i < placements.length; i++) {
        var pp = placements[i];
        if (pp.xMm < minX) minX = pp.xMm;
        if (pp.yMm < minY) minY = pp.yMm;
        if (pp.xMm + pp.widthMm > maxX) maxX = pp.xMm + pp.widthMm;
        if (pp.yMm + pp.heightMm > maxY) maxY = pp.yMm + pp.heightMm;
    }

    var rectLeft = minX * mm2pt;
    var rectTop = -(minY * mm2pt);
    var rectWidth = (maxX - minX) * mm2pt;
    var rectHeight = (maxY - minY) * mm2pt;

    var frameRect = molduraLayer.pathItems.rectangle(rectTop, rectLeft, rectWidth, rectHeight);
    frameRect.filled = false;
    frameRect.stroked = true;
    frameRect.strokeWidth = 0.5;

    // Cor do stroke conforme espaço de cor do documento
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

    // Trazer camada para o topo
    molduraLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseJson(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        throw new Error("JSON invalido do motor: " + e.message);
    }
}

function escapeJson(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
}
