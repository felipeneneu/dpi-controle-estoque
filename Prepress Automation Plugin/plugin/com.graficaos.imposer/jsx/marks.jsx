// ── Prepress Automation — marks.jsx ──
// Implementação fiel do motor de marcas SmartMarks do Kodak Preps 9 (Sample Group)
// e controle de marcas de pré-impressão em camadas independentes.

// ── Helpers de Camada e Cores ──────────────────────────────────────

function ensureTargetLayer(doc, layerName) {
    var layer = null;
    try {
        layer = doc.layers.getByName(layerName);
    } catch (e) {
        layer = doc.layers.add();
        layer.name = layerName;
    }

    // Desbloquear e tornar visível toda a hierarquia
    unlockLayerChain(layer);

    // Limpar itens anteriores dessa camada de marcas
    for (var i = layer.pageItems.length - 1; i >= 0; i--) {
        try { layer.pageItems[i].locked = false; } catch (eL) {}
        try { layer.pageItems[i].remove(); } catch (eR) {}
    }

    layer.zOrder(ZOrderMethod.BRINGTOFRONT);
    return layer;
}

function getRegistrationColor(doc) {
    try {
        return doc.swatches.getByName("[Registration]").color;
    } catch (e) {
        var c = new CMYKColor();
        c.cyan = 100;
        c.magenta = 100;
        c.yellow = 100;
        c.black = 100;
        return c;
    }
}

function getCmykColor(c, m, y, k) {
    var col = new CMYKColor();
    col.cyan = c;
    col.magenta = m;
    col.yellow = y;
    col.black = k;
    return col;
}

function drawMarkLine(layer, x1, y1, x2, y2, color, strokeWidth) {
    var line = layer.pathItems.add();
    line.setEntirePath([[x1, y1], [x2, y2]]);
    line.filled = false;
    line.stroked = true;
    line.strokeWidth = (strokeWidth !== undefined && strokeWidth > 0) ? strokeWidth : 0.25;
    line.strokeColor = color;
    return line;
}

// ── Função Principal de Aplicação de Marcas ────────────────────────

function drawPrepsSmartMarks(planJson, optionsJson) {
    try {
        if (app.documents.length === 0) {
            return '{"success":false,"errorCode":"E_NO_DOC","message":"Nenhum documento aberto."}';
        }

        var doc = app.activeDocument;
        var plan = typeof planJson === "string" ? JSON.parse(planJson) : planJson;
        var opt = typeof optionsJson === "string" ? JSON.parse(optionsJson) : (optionsJson || {});

        if (!plan || !plan.placements || plan.placements.length === 0) {
            return '{"success":false,"errorCode":"E_NO_PLACEMENTS","message":"Plano sem posicoes para marcas."}';
        }

        var mm2pt = 72.0 / 25.4;
        var regColor = getRegistrationColor(doc);

        // Coordenadas de origem da prancheta ativa
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var abRect = ab.artboardRect; // [left, top, right, bottom]
        var originX = abRect[0];
        var originY = abRect[1];
        var sheetW = Math.abs(abRect[2] - abRect[0]);
        var sheetH = Math.abs(abRect[1] - abRect[3]);

        // Se keepArtboard for falso e sheet estiver no plano, a prancheta foi movida para [0, 0]
        if (!opt.keepArtboard && plan.sheet) {
            originX = 0;
            originY = 0;
            sheetW = plan.sheet.widthMm * mm2pt;
            sheetH = plan.sheet.heightMm * mm2pt;
        }

        // Parâmetros configuráveis de marcas (com defaults exatos do Preps 9)
        // Cropmarks.smk do Preps 9: smartoffsetx = 9 pt (3.175mm), smartoffsety = 18 pt (6.35mm), hairline = 0.25 pt
        var markOffsetPt = (opt.markOffsetPt !== undefined && isFinite(opt.markOffsetPt)) ? opt.markOffsetPt : (9.0);
        var markLengthPt = (opt.markLengthPt !== undefined && isFinite(opt.markLengthPt)) ? opt.markLengthPt : (18.0);
        var strokeWidthPt = (opt.strokeWidthPt !== undefined && isFinite(opt.strokeWidthPt)) ? opt.strokeWidthPt : (0.25);
        var outsideOnly = (opt.outsideOnly !== undefined) ? opt.outsideOnly : true;
        var bleedPt = (opt.bleedMm !== undefined && isFinite(opt.bleedMm) && opt.bleedMm > 0) ? (opt.bleedMm * mm2pt) : 0;
        var marksType = opt.marksType || "preps_sample_group"; // "none" | "preps_sample_group" | "preps_cropmarks" | "moldura"

        // 1. Guias de TrimBox (se habilitado)
        if (opt.drawTrimBoxGuides) {
            var trimLayer = ensureTargetLayer(doc, "Guias_TrimBox");
            drawTrimBoxGuides(plan, trimLayer, originX, originY, mm2pt, bleedPt);
        }

        // 2. Marcas de Corte (Cropmarks)
        if (marksType === "preps_sample_group" || marksType === "preps_cropmarks") {
            var cropLayer = ensureTargetLayer(doc, "Marcas_Corte");
            drawCropMarksPreps(plan, cropLayer, originX, originY, mm2pt, bleedPt, markOffsetPt, markLengthPt, strokeWidthPt, outsideOnly, regColor);
        }

        // 2b. Marcas Mimaki FineCut (Tipo 1 / FCRM)
        if (marksType === "mimaki_finecut" || marksType === "mimaki_fcrm") {
            drawMimakiFineCutMarks(plan, doc, opt, originX, originY, mm2pt, regColor);
        }

        // 3. Slugline (Sample Group)
        if (marksType === "preps_sample_group" && opt.drawSlugline !== false) {
            var slugLayer = ensureTargetLayer(doc, "Marcas_Slugline");
            drawPrepsSlugline(plan, doc, slugLayer, originX, originY, sheetH, regColor);
        }

        // 4. ColorBar (Sample Group)
        if (marksType === "preps_sample_group" && opt.drawColorBar !== false) {
            var colorBarLayer = ensureTargetLayer(doc, "Marcas_ColorBar");
            drawPrepsColorBar(plan, colorBarLayer, originX, originY, sheetW, mm2pt);
        }

        app.redraw();
        return '{"success":true,"message":"Marcas Preps aplicadas com sucesso."}';
    } catch (e) {
        return '{"success":false,"errorCode":"E_MARKS","message":"' + escapeJson(e.message) + '"}';
    }
}

// ── 1. Guias de TrimBox ────────────────────────────────────────────

function drawTrimBoxGuides(plan, layer, originX, originY, mm2pt, bleedPt) {
    layer.printable = false; // Bloqueado para impressão: estritamente para visualização na prancheta
    for (var i = 0; i < plan.placements.length; i++) {
        var p = plan.placements[i];
        var cellLeft = originX + (p.xMm * mm2pt);
        var cellTop = originY - (p.yMm * mm2pt);
        var cellW = p.widthMm * mm2pt;
        var cellH = p.heightMm * mm2pt;

        // Se houver sangria, o TrimBox fica inset pela sangria
        var trimLeft = cellLeft + bleedPt;
        var trimTop = cellTop - bleedPt;
        var trimW = Math.max(0.1, cellW - (2 * bleedPt));
        var trimH = Math.max(0.1, cellH - (2 * bleedPt));

        var guideRect = layer.pathItems.rectangle(trimTop, trimLeft, trimW, trimH);
        guideRect.filled = false;
        guideRect.stroked = true;
        guideRect.strokeWidth = 0.25;
        guideRect.guides = true; // Transforma em linha-guia nativa do Illustrator (Ctrl + ;)
        guideRect.locked = true; // Bloqueado contra edição acidental
    }
}

// ── 2. Preps SmartCropMarks ────────────────────────────────────────

function drawCropMarksPreps(plan, layer, originX, originY, mm2pt, bleedPt, offsetPt, lengthPt, strokePt, outsideOnly, regColor) {
    var placements = plan.placements;
    if (placements.length === 0) return;

    var gridCols = (plan.grid && plan.grid.cols) ? plan.grid.cols : 1;
    var gridRows = (plan.grid && plan.grid.rows) ? plan.grid.rows : 1;
    var gapMm = (plan.grid && plan.grid.gapMm !== undefined) ? plan.grid.gapMm : 0;
    var isCorteSeco = gapMm <= 0.05;

    if (isCorteSeco) {
        // ── CORTE SECO (Corte Compartilhado / Flush Cut) ──
        // Em corte seco, o corte passa direto pela folha.
        // As marcas são geradas EXCLUSIVAMENTE no perímetro externo da grade,
        // alinhadas com cada linha de corte vertical e horizontal.
        // Nenhuma marca passa por cima das artes nem se duplica!
        var xCutMap = {};
        var yCutMap = {};
        var minX = 1e300, maxX = -1e300, maxTop = -1e300, minBottom = 1e300;

        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            var cL = originX + (p.xMm * mm2pt);
            var cT = originY - (p.yMm * mm2pt);
            var cW = p.widthMm * mm2pt;
            var cH = p.heightMm * mm2pt;
            var cR = cL + cW;
            var cB = cT - cH;

            if (cL < minX) minX = cL;
            if (cR > maxX) maxX = cR;
            if (cT > maxTop) maxTop = cT;
            if (cB < minBottom) minBottom = cB;

            var keyL = (Math.round(cL * 10) / 10).toFixed(1);
            var keyR = (Math.round(cR * 10) / 10).toFixed(1);
            var keyT = (Math.round(cT * 10) / 10).toFixed(1);
            var keyB = (Math.round(cB * 10) / 10).toFixed(1);

            xCutMap[keyL] = cL;
            xCutMap[keyR] = cR;
            yCutMap[keyT] = cT;
            yCutMap[keyB] = cB;
        }

        // Marcas verticais externas (no topo e na base de cada coluna/corte vertical)
        for (var kx in xCutMap) {
            if (!xCutMap.hasOwnProperty(kx)) continue;
            var cutX = xCutMap[kx];
            drawMarkLine(layer, cutX, maxTop + offsetPt, cutX, maxTop + offsetPt + lengthPt, regColor, strokePt);
            drawMarkLine(layer, cutX, minBottom - offsetPt, cutX, minBottom - offsetPt - lengthPt, regColor, strokePt);
        }

        // Marcas horizontais externas (na esquerda e direita de cada linha/corte horizontal)
        for (var ky in yCutMap) {
            if (!yCutMap.hasOwnProperty(ky)) continue;
            var cutY = yCutMap[ky];
            drawMarkLine(layer, minX - offsetPt - lengthPt, cutY, minX - offsetPt, cutY, regColor, strokePt);
            drawMarkLine(layer, maxX + offsetPt, cutY, maxX + offsetPt + lengthPt, cutY, regColor, strokePt);
        }

        return;
    }

    // ── GRADE COM GAP (Com espaçamento entre poses) ──
    for (var i = 0; i < placements.length; i++) {
        var p = placements[i];
        var col = p.col !== undefined ? p.col : 0;
        var row = p.row !== undefined ? p.row : 0;

        var isLeftEdge = (col === 0);
        var isRightEdge = (col === gridCols - 1);
        var isTopEdge = (row === 0);
        var isBottomEdge = (row === gridRows - 1);

        var cellLeft = originX + (p.xMm * mm2pt);
        var cellTop = originY - (p.yMm * mm2pt);
        var cellW = p.widthMm * mm2pt;
        var cellH = p.heightMm * mm2pt;

        var trimLeft = cellLeft + bleedPt;
        var trimTop = cellTop - bleedPt;
        var trimRight = cellLeft + cellW - bleedPt;
        var trimBottom = cellTop - cellH + bleedPt;

        var drawTL_H = !outsideOnly || isLeftEdge;
        var drawTL_V = !outsideOnly || isTopEdge;
        var drawTR_H = !outsideOnly || isRightEdge;
        var drawTR_V = !outsideOnly || isTopEdge;
        var drawBL_H = !outsideOnly || isLeftEdge;
        var drawBL_V = !outsideOnly || isBottomEdge;
        var drawBR_H = !outsideOnly || isRightEdge;
        var drawBR_V = !outsideOnly || isBottomEdge;

        if (drawTL_H) drawMarkLine(layer, trimLeft - offsetPt - lengthPt, trimTop, trimLeft - offsetPt, trimTop, regColor, strokePt);
        if (drawTL_V) drawMarkLine(layer, trimLeft, trimTop + offsetPt + lengthPt, trimLeft, trimTop + offsetPt, regColor, strokePt);
        if (drawTR_H) drawMarkLine(layer, trimRight + offsetPt, trimTop, trimRight + offsetPt + lengthPt, trimTop, regColor, strokePt);
        if (drawTR_V) drawMarkLine(layer, trimRight, trimTop + offsetPt + lengthPt, trimRight, trimTop + offsetPt, regColor, strokePt);
        if (drawBL_H) drawMarkLine(layer, trimLeft - offsetPt - lengthPt, trimBottom, trimLeft - offsetPt, trimBottom, regColor, strokePt);
        if (drawBL_V) drawMarkLine(layer, trimLeft, trimBottom - offsetPt - lengthPt, trimLeft, trimBottom - offsetPt, regColor, strokePt);
        if (drawBR_H) drawMarkLine(layer, trimRight + offsetPt, trimBottom, trimRight + offsetPt + lengthPt, trimBottom, regColor, strokePt);
        if (drawBR_V) drawMarkLine(layer, trimRight, trimBottom - offsetPt - lengthPt, trimRight, trimBottom - offsetPt, regColor, strokePt);
    }
}

// ── 3. Preps Slugline ──────────────────────────────────────────────

function drawPrepsSlugline(plan, doc, layer, originX, originY, sheetH, regColor) {
    try {
        // Posição no rodapé inferior esquerdo (Slugline.smk: smartoffsetx: 36 pt, smartoffsety: 18 pt)
        var slugX = originX + 36.0;
        var slugY = (originY - sheetH) + 18.0;

        var d = new Date();
        var dateStr = (d.getDate() < 10 ? "0" : "") + d.getDate() + "/" +
                      ((d.getMonth() + 1) < 10 ? "0" : "") + (d.getMonth() + 1) + "/" +
                      d.getFullYear() + " " +
                      (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" +
                      (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();

        var g = plan.grid || {};
        var docName = doc.name ? doc.name : "Trabalho";
        var textContent = docName + "  |  " + dateStr +
                          "  |  Grade: " + (g.cols || 0) + "x" + (g.rows || 0) +
                          " (" + (g.plannedUnits || 0) + " un)" +
                          "  |  Prepress Automation";

        var textFrame = layer.textFrames.add();
        textFrame.contents = textContent;
        textFrame.left = slugX;
        textFrame.top = slugY;

        var charAttr = textFrame.textRange.characterAttributes;
        charAttr.size = 8;
        charAttr.fillColor = regColor;
        charAttr.strokeColor = new NoColor();
    } catch (eSlug) {}
}

// ── 4. Preps ColorBar (Fiel ao Kodak Preps 9 colorbar.eps) ──────────

function drawPrepsColorBar(plan, layer, originX, originY, sheetW, mm2pt) {
    try {
        // Especificação original Kodak Preps 9 (colorbar.eps / ColorBar.smk):
        // BoundingBox: 360 pt x 18 pt. Deslocamento: smartoffsety: -9 pt.
        var barW = 360.0;
        var barH = 18.0;
        var topY = originY - 9.0;
        var startX = originX + (sheetW - barW) / 2.0;

        // Bloco inicial (cb_patch0x = 8 pt): Rótulos "PREPS" e "C M Y K"
        var leadGroup = layer.groupItems.add();

        try {
            var tfPreps = leadGroup.textFrames.add();
            tfPreps.contents = "PREPS";
            tfPreps.left = startX + 0.75;
            tfPreps.top = topY - (barH / 2.0) + 1.25;
            var caP = tfPreps.textRange.characterAttributes;
            caP.size = 2.0;
            caP.fillColor = getCmykColor(0, 0, 0, 100);
            caP.strokeColor = new NoColor();
        } catch (eP) {}

        try {
            var addLetter = function(letterChar, col, xRel, yFromTop) {
                var tf = leadGroup.textFrames.add();
                tf.contents = letterChar;
                tf.left = startX + xRel;
                tf.top = topY - yFromTop;
                var ca = tf.textRange.characterAttributes;
                ca.size = 6.0;
                ca.fillColor = col;
                ca.strokeColor = new NoColor();
            };
            addLetter("C", getCmykColor(100, 0, 0, 0), 0.75, 2.0);
            addLetter("M", getCmykColor(0, 100, 0, 0), 4.25, 2.0);
            addLetter("Y", getCmykColor(0, 0, 100, 0), 0.75, 11.0);
            addLetter("K", getCmykColor(0, 0, 0, 100), 4.25, 11.0);
        } catch (eLetters) {}

        // Os 26 patches idênticos ao Kodak Preps 9 (colorbar.eps)
        var patchW = (360.0 - 8.0) / 26.0; // 13.5385 pt cada
        var patchLeftStart = startX + 8.0;

        var patches = [
            // [C, M, Y, K, isStar]
            [100, 0, 0, 0, false],       // 1: solid cyan
            [100, 0, 100, 0, false],     // 2: solid cyan and yellow
            [0, 0, 100, 0, false],       // 3: solid yellow
            [0, 100, 100, 0, false],     // 4: solid yellow and magenta
            [0, 100, 0, 0, false],       // 5: solid magenta
            [100, 100, 0, 0, false],     // 6: solid magenta and cyan
            [100, 0, 0, 0, false],       // 7: solid cyan
            [100, 100, 100, 0, false],   // 8: solid cyan, magenta and yellow
            [40, 40, 40, 0, false],      // 9: 40% cyan, magenta and yellow
            [40, 30, 30, 0, false],      // 10: gray balance
            [0, 0, 0, 40, false],        // 11: 40% black
            [40, 20, 30, 0, false],      // 12: gray balance
            [0, 0, 0, 100, false],       // 13: solid black
            [100, 0, 0, 0, false],       // 14: solid cyan
            [40, 0, 0, 0, false],        // 15: 40% cyan
            [0, 0, 100, 0, false],       // 16: solid yellow
            [0, 0, 40, 0, false],        // 17: 40% yellow
            [0, 100, 0, 0, false],       // 18: solid magenta
            [0, 40, 0, 0, false],        // 19: 40% magenta
            [0, 40, 40, 0, false],       // 20: 40% yellow and magenta
            [40, 0, 40, 0, false],       // 21: 40% cyan and yellow
            [40, 40, 0, 0, false],       // 22: 40% magenta and cyan
            [100, 0, 0, 0, true],        // 23: solid cyan star
            [0, 0, 100, 0, true],        // 24: solid yellow star
            [0, 100, 0, 0, true],        // 25: solid magenta star
            [0, 0, 0, 100, true]         // 26: solid black star
        ];

        for (var i = 0; i < patches.length; i++) {
            var pData = patches[i];
            var col = getCmykColor(pData[0], pData[1], pData[2], pData[3]);
            var px = patchLeftStart + (i * patchW);
            var isStar = pData[4];

            if (!isStar) {
                var rect = layer.pathItems.rectangle(topY, px, patchW, barH);
                rect.stroked = false;
                rect.filled = true;
                rect.fillColor = col;
            } else {
                // Patch com estrela de resolução Siemens do Preps (36 fatias radiais / rosette)
                var centerX = px + (patchW / 2.0);
                var centerY = topY - (barH / 2.0);
                var radius = Math.min(patchW, barH) * 0.44;
                var slices = 36;
                var angleStep = (2 * Math.PI) / slices;

                for (var s = 0; s < slices; s += 2) {
                    var a1 = s * angleStep;
                    var a2 = (s + 1) * angleStep;
                    var x1 = centerX + radius * Math.cos(a1);
                    var y1 = centerY + radius * Math.sin(a1);
                    var x2 = centerX + radius * Math.cos(a2);
                    var y2 = centerY + radius * Math.sin(a2);

                    var wedge = layer.pathItems.add();
                    wedge.setEntirePath([[centerX, centerY], [x1, y1], [x2, y2]]);
                    wedge.closed = true;
                    wedge.stroked = false;
                    wedge.filled = true;
                    wedge.fillColor = col;
                }
            }
        }
    } catch (eBar) {}
}

// ── Marcas Mimaki FineCut (Tipo 1 / FCRM) ───────────────────────────

function drawMimakiFineCutMarks(plan, doc, opt, originX, originY, mm2pt, regColor) {
    try {
        var markLayer = ensureTargetLayer(doc, "FC RegisterMark Layer");
        markLayer.printable = true;

        if (!plan.placements || plan.placements.length === 0) return;

        // Bounding box da grade imposta (já centralizada/posicionada)
        var minX = 1e300, maxX = -1e300, minY = 1e300, maxY = -1e300;
        for (var i = 0; i < plan.placements.length; i++) {
            var pl = plan.placements[i];
            var px = originX + (pl.xMm * mm2pt);
            var py = originY - (pl.yMm * mm2pt);
            var pw = pl.widthMm * mm2pt;
            var ph = pl.heightMm * mm2pt;
            if (px < minX) minX = px;
            if (px + pw > maxX) maxX = px + pw;
            if (py > maxY) maxY = py;
            if (py - ph < minY) minY = py - ph;
        }

        // Parâmetros FineCut
        var marginMm = (opt.marginMm !== undefined && isFinite(opt.marginMm) && opt.marginMm > 0) ? opt.marginMm : 5.0;
        var marginPt = marginMm * mm2pt;
        var markSizeMm = (opt.markLengthMm !== undefined && isFinite(opt.markLengthMm) && opt.markLengthMm > 0) ? opt.markLengthMm : 10.0;
        var markSizePt = markSizeMm * mm2pt;
        var strokeWidthMm = (opt.strokeWidthMm !== undefined && isFinite(opt.strokeWidthMm) && opt.strokeWidthMm > 0) ? opt.strokeWidthMm : 1.0;
        var strokeWidthPt = strokeWidthMm * mm2pt;
        var isFcrm = (opt.marksType === "mimaki_fcrm");

        // Coordenadas dos 4 vértices externos (OutTombo Mimaki)
        var outerL = minX - marginPt;
        var outerR = maxX + marginPt;
        var outerT = maxY + marginPt;
        var outerB = minY - marginPt;

        // Cor do traço Mimaki: Preto 100% ou Registration
        var markColor = regColor || getCmykColor(0, 0, 0, 100);
        var whiteColor = getCmykColor(0, 0, 0, 0);

        // Helper para desenhar cantoneira L
        function drawMimakiCorner(layer, vx, vy, hx, vy2, isOrigin) {
            // Se FCRM: fundo branco quadrado para leitura do sensor óptico
            if (isFcrm) {
                var padSize = markSizePt + (4.0 * mm2pt);
                var padLeft = (hx >= vx) ? (vx - 2.0 * mm2pt) : (vx - markSizePt - 2.0 * mm2pt);
                var padTop = (vy2 <= vy) ? (vy + 2.0 * mm2pt) : (vy + markSizePt + 2.0 * mm2pt);
                var pad = layer.pathItems.rectangle(padTop, padLeft, padSize, padSize);
                pad.filled = true;
                pad.fillColor = whiteColor;
                pad.stroked = false;
                try {
                    var tPad = pad.tags.add();
                    tPad.name = "MimakiFineCutTomboRoundTag";
                    tPad.value = "MimakiFCRMRnd";
                } catch (eTP) {}
            }

            // Cantoneira L
            var lPath = layer.pathItems.add();
            lPath.setEntirePath([[hx, vy], [vx, vy], [vx, vy2]]);
            lPath.closed = false;
            lPath.stroked = true;
            lPath.strokeWidth = strokeWidthPt;
            lPath.strokeColor = markColor;
            lPath.filled = false;

            // Tags nativas Mimaki FineCut
            try {
                var tTombo = lPath.tags.add();
                tTombo.name = "MimakiFineCutTomboTag";
                tTombo.value = isFcrm ? "MimakiFCRM" : "MimakiFineCutSquareTomboTag";
            } catch (eTT) {}

            // Marca de Direção de Impressão / Origem (AddMark no ponto de origem / C4)
            if (isOrigin) {
                var dirLen = 2.5 * mm2pt;
                var dirLine = layer.pathItems.add();
                dirLine.setEntirePath([[vx + markSizePt * 0.4, vy - dirLen], [vx + markSizePt * 0.4, vy]]);
                dirLine.closed = false;
                dirLine.stroked = true;
                dirLine.strokeWidth = strokeWidthPt * 0.75;
                dirLine.strokeColor = markColor;
                dirLine.filled = false;
                try {
                    var tDir = dirLine.tags.add();
                    tDir.name = "MimakiFineCutTomboTag";
                    tDir.value = "MimakiFCRMDir";
                } catch (eTD) {}
            }
            return lPath;
        }

        // C1: Canto Superior Esquerdo (Top-Left)
        // Linhas correm para a direita e para baixo
        drawMimakiCorner(markLayer, outerL, outerT, outerL + markSizePt, outerT - markSizePt, false);

        // C2: Canto Superior Direito (Top-Right)
        // Linhas correm para a esquerda e para baixo
        drawMimakiCorner(markLayer, outerR, outerT, outerR - markSizePt, outerT - markSizePt, false);

        // C3: Canto Inferior Direito (Bottom-Right)
        // Linhas correm para a esquerda e para cima
        drawMimakiCorner(markLayer, outerR, outerB, outerR - markSizePt, outerB + markSizePt, false);

        // C4: Canto Inferior Esquerdo (Bottom-Left — Origem da Mimaki)
        // Linhas correm para a direita e para cima
        drawMimakiCorner(markLayer, outerL, outerB, outerL + markSizePt, outerB + markSizePt, true);

        // Se opção de moldura retangular estiver ativa para FineCut
        if (opt.shouldDrawFrame) {
            var frameLayer = ensureTargetLayer(doc, "FC Frame Layer");
            var frameRect = frameLayer.pathItems.rectangle(outerT, outerL, outerR - outerL, outerT - outerB);
            frameRect.filled = false;
            frameRect.stroked = true;
            frameRect.strokeWidth = 0.5;
            frameRect.strokeColor = markColor;
            try {
                var tFrame = frameRect.tags.add();
                tFrame.name = "MimakiFineCutExtractFrameTag";
                tFrame.value = "1";
            } catch (eTF) {}
        }
    } catch (eMimaki) {}
}
