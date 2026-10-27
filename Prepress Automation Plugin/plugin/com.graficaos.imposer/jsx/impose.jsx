// ── Polyfill JSON (json2.js — domínio público) ─────────────────────
// O ExtendScript do Illustrator NÃO possui o objeto global JSON. Este
// polyfill (Crockford, JSON-js 2023-05-10) fornece parse/stringify.

if (typeof JSON !== "object") {
    JSON = {};
}

(function () {
    "use strict";

    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
    var rx_escapable = /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    function f(n) { return (n < 10) ? "0" + n : n; }
    function this_value() { return this.valueOf(); }

    if (typeof Date.prototype.toJSON !== "function") {
        Date.prototype.toJSON = function () {
            return isFinite(this.valueOf())
                ? (this.getUTCFullYear() + "-" + f(this.getUTCMonth() + 1) + "-" + f(this.getUTCDate())
                    + "T" + f(this.getUTCHours()) + ":" + f(this.getUTCMinutes()) + ":" + f(this.getUTCSeconds()) + "Z")
                : null;
        };
        Boolean.prototype.toJSON = this_value;
        Number.prototype.toJSON = this_value;
        String.prototype.toJSON = this_value;
    }

    var gap;
    var indent;
    var meta;
    var rep;

    function quote(string) {
        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string)
            ? "\"" + string.replace(rx_escapable, function (a) {
                var c = meta[a];
                return typeof c === "string" ? c
                    : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
            }) + "\""
            : "\"" + string + "\"";
    }

    function str(key, holder) {
        var i;
        var k;
        var v;
        var length;
        var mind = gap;
        var partial;
        var value = holder[key];

        if (value && typeof value === "object" && typeof value.toJSON === "function") {
            value = value.toJSON(key);
        }
        if (typeof rep === "function") {
            value = rep.call(holder, key, value);
        }

        switch (typeof value) {
        case "string":
            return quote(value);
        case "number":
            return (isFinite(value)) ? String(value) : "null";
        case "boolean":
        case "null":
            return String(value);
        case "object":
            if (!value) {
                return "null";
            }
            gap += indent;
            partial = [];
            if (Object.prototype.toString.apply(value) === "[object Array]") {
                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || "null";
                }
                v = partial.length === 0
                    ? "[]"
                    : gap
                        ? ("[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]")
                        : "[" + partial.join(",") + "]";
                gap = mind;
                return v;
            }
            if (rep && typeof rep === "object") {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === "string") {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + ((gap) ? ": " : ":") + v);
                        }
                    }
                }
            } else {
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + ((gap) ? ": " : ":") + v);
                        }
                    }
                }
            }
            v = partial.length === 0
                ? "{}"
                : gap
                    ? ("{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}")
                    : "{" + partial.join(",") + "}";
            gap = mind;
            return v;
        }
    }

    if (typeof JSON.stringify !== "function") {
        meta = {
            "\b": "\\b",
            "\t": "\\t",
            "\n": "\\n",
            "\f": "\\f",
            "\r": "\\r",
            "\"": "\\\"",
            "\\": "\\\\"
        };
        JSON.stringify = function (value, replacer, space) {
            var i;
            gap = "";
            indent = "";
            if (typeof space === "number") {
                for (i = 0; i < space; i += 1) { indent += " "; }
            } else if (typeof space === "string") {
                indent = space;
            }
            rep = replacer;
            if (replacer && typeof replacer !== "function"
                && (typeof replacer !== "object" || typeof replacer.length !== "number")) {
                throw new Error("JSON.stringify");
            }
            return str("", {"": value});
        };
    }

    if (typeof JSON.parse !== "function") {
        JSON.parse = function (text, reviver) {
            var j;

            function walk(holder, key) {
                var k;
                var v;
                var value = holder[key];
                if (value && typeof value === "object") {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }

            text = String(text);
            rx_dangerous.lastIndex = 0;
            if (rx_dangerous.test(text)) {
                text = text.replace(rx_dangerous, function (a) {
                    return "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

            if (
                rx_one.test(
                    text.replace(rx_two, "@").replace(rx_three, "]").replace(rx_four, "")
                )
            ) {
                j = eval("(" + text + ")");
                return (typeof reviver === "function") ? walk({"": j}, "") : j;
            }

            throw new SyntaxError("JSON.parse");
        };
    }
}());

// ── Prepress Automation — impose.jsx ──

// ── Inlined marks.jsx ──
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

// ── End Inlined marks.jsx ──
// Rotina ExtendScript (ES3) do painel CEP: apenas operações de DOM do
// Illustrator. O motor COM é invocado pelo painel via probe WSH (cscript),
// porque o ExtendScript 4.5.x do Illustrator não expõe ActiveXObject.
// Todas as funções recebem/retornam strings JSON.

// ── Funções chamadas pelo painel CEP ────────────────────────────────

function applyComputedPlan(json, optionsArg) {
    try {
        var result = parseJson(json);

        if (!result.success) return json;
        if (!result.placements || result.placements.length === 0) {
            return '{"success":false,"errorCode":"E_NO_PLACEMENTS","message":"Plano sem posicoes."}';
        }

        var opt = {};
        if (typeof optionsArg === "string") {
            try { opt = JSON.parse(optionsArg); } catch (e) {
                opt = { shouldDrawFrame: optionsArg === "true" };
            }
        } else if (typeof optionsArg === "boolean") {
            opt = { shouldDrawFrame: optionsArg };
        } else if (typeof optionsArg === "object" && optionsArg !== null) {
            opt = optionsArg;
        }

        var keepArtboard = (opt.keepArtboard === undefined) ? true : (opt.keepArtboard === true || opt.keepArtboard === "true");
        opt.keepArtboard = keepArtboard;

        applyPlacementsToActiveDoc(result, opt);

        // Moldura de Registro
        if (opt.marksType === "moldura" || opt.shouldDrawFrame === true) {
            drawMolduraFrame(result, opt);
        }

        // Marcas Preps, Mimaki e/ou Guias de TrimBox
        if (opt.marksType === "preps_sample_group" || opt.marksType === "preps_cropmarks" || opt.drawTrimBoxGuides || opt.marksType === "mimaki_finecut" || opt.marksType === "mimaki_fcrm") {
            drawPrepsSmartMarks(result, opt);
        }

        // Auto-Ajuste da Prancheta (Fit Artboard to Content)
        if (!keepArtboard) {
            fitArtboardToContent(result, opt);
        }

        return '{"success":true,"placementCount":' + result.placements.length + ',"message":"Bancada aplicada."}';
    } catch (e) {
        return '{"success":false,"errorCode":"E_APPLY","message":"' + escapeJson(e.message) + '"}';
    }
}

function getActiveArtboardBounds() {
    try {
        if (app.documents.length === 0) {
            return '{"success":false,"message":"Nenhum documento aberto."}';
        }
        var doc = app.activeDocument;
        var abIdx = doc.artboards.getActiveArtboardIndex();
        var ab = doc.artboards[abIdx];
        var rect = ab.artboardRect; // [left, top, right, bottom]
        var wPt = Math.abs(rect[2] - rect[0]);
        var hPt = Math.abs(rect[1] - rect[3]);
        var mm = 25.4 / 72.0;
        var wMm = Math.round((wPt * mm) * 10) / 10;
        var hMm = Math.round((hPt * mm) * 10) / 10;
        return '{"success":true,"widthMm":' + wMm + ',"heightMm":' + hMm + ',"index":' + abIdx + ',"name":"' + escapeJson(ab.name) + '"}';
    } catch (e) {
        return '{"success":false,"message":"' + escapeJson(e.message) + '"}';
    }
}

// ── Helpers de Medição e Máscaras de Recorte ────────────────────────

function isClippingItem(item) {
    if (!item) return false;
    try {
        if (item.clipping) return true;
    } catch (e1) {}
    if (item.typename === "CompoundPathItem") {
        try {
            if (item.pathItems && item.pathItems.length > 0 && item.pathItems[0].clipping) {
                return true;
            }
        } catch (e2) {}
    }
    return false;
}

function getClippingMask(group) {
    if (!group || group.typename !== "GroupItem" || !group.clipped) return null;
    var items = group.pageItems;
    if (!items || items.length === 0) return null;

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (isClippingItem(it)) {
            return it;
        }
    }
    // Fallback padrão do Illustrator: o primeiro item da pilha de um Clip Group é o clipping path
    return items[0];
}

function getItemVisibleBounds(item) {
    if (!item) return null;
    try {
        if (item.guides || item.hidden) return null;
    } catch (eg) {}

    // Grupo
    if (item.typename === "GroupItem") {
        var pItems = item.pageItems;
        if (!pItems || pItems.length === 0) return null;

        // Se o grupo é uma máscara de recorte (<Clip Group>):
        // Os limites visíveis são DITADOS pela máscara. O conteúdo que vaza fora da máscara é ignorado.
        if (item.clipped) {
            var mask = getClippingMask(item);
            if (mask && mask !== item) {
                var mb = getItemVisibleBounds(mask);
                if (mb) return mb;
            }
        }

        // Tenta visibleBounds do grupo diretamente (calculado nativamente pelo Illustrator C++)
        try {
            var gvb = item.visibleBounds;
            if (gvb && isFinite(gvb[0]) && isFinite(gvb[1]) && isFinite(gvb[2]) && isFinite(gvb[3])) {
                var gl = Math.min(gvb[0], gvb[2]);
                var gr = Math.max(gvb[0], gvb[2]);
                var gt = Math.max(gvb[1], gvb[3]);
                var gb = Math.min(gvb[1], gvb[3]);
                if (gr > gl && gt > gb) {
                    return [gl, gt, gr, gb];
                }
            }
        } catch (eGVB) {}

        // Grupo comum ou fallback: união dos limites dos filhos
        var minL = 1e300, maxR = -1e300, maxT = -1e300, minB = 1e300;
        var hasValid = false;

        for (var i = 0; i < pItems.length; i++) {
            var cb = getItemVisibleBounds(pItems[i]);
            if (cb) {
                hasValid = true;
                if (cb[0] < minL) minL = cb[0];
                if (cb[1] > maxT) maxT = cb[1];
                if (cb[2] > maxR) maxR = cb[2];
                if (cb[3] < minB) minB = cb[3];
            }
        }

        if (hasValid) {
            return [minL, maxT, maxR, minB];
        }
        return null;
    }

    // Demais tipos (PathItem, CompoundPathItem, PlacedItem, RasterItem, TextFrame, PluginItem, etc.)
    // Tenta visibleBounds primeiro (inclui traçado e suporta Placed/Raster)
    try {
        var vb = item.visibleBounds;
        if (vb && isFinite(vb[0]) && isFinite(vb[1]) && isFinite(vb[2]) && isFinite(vb[3])) {
            var l = Math.min(vb[0], vb[2]);
            var r = Math.max(vb[0], vb[2]);
            var t = Math.max(vb[1], vb[3]);
            var b = Math.min(vb[1], vb[3]);
            if (r > l && t > b) {
                return [l, t, r, b];
            }
        }
    } catch (eVB) {}

    // Fallback: geometricBounds
    try {
        var gb = item.geometricBounds;
        if (gb && isFinite(gb[0]) && isFinite(gb[1]) && isFinite(gb[2]) && isFinite(gb[3])) {
            var l = Math.min(gb[0], gb[2]);
            var r = Math.max(gb[0], gb[2]);
            var t = Math.max(gb[1], gb[3]);
            var b = Math.min(gb[1], gb[3]);
            if (r > l && t > b) {
                return [l, t, r, b];
            }
        }
    } catch (eGB) {}

    return null;
}

// Desbloqueia e torna visível a camada e toda a cadeia de camadas ancestrais
function unlockLayerChain(layer) {
    var cur = layer;
    while (cur && cur.typename === "Layer") {
        try { cur.locked = false; } catch (e1) {}
        try { cur.visible = true; } catch (e2) {}
        cur = cur.parent;
    }
}

// ── Medidas da seleção ──────────────────────────────────────────────

function getSelectionBounds() {
    try {
        var d = app.activeDocument;
        if (!d) return '{"selection":false,"message":"Nenhum documento aberto."}';
        var sel = d.selection;
        if (!sel || sel.length === 0) return '{"selection":false,"message":"Nenhum objeto selecionado."}';

        var mm = 25.4 / 72.0;
        var minL = 1e300, maxR = -1e300, maxT = -1e300, minB = 1e300;
        var hasValid = false;

        for (var i = 0; i < sel.length; i++) {
            var b = getItemVisibleBounds(sel[i]);
            if (b) {
                hasValid = true;
                if (b[0] < minL) minL = b[0];
                if (b[1] > maxT) maxT = b[1];
                if (b[2] > maxR) maxR = b[2];
                if (b[3] < minB) minB = b[3];
            }
        }

        if (!hasValid) {
            return '{"selection":false,"message":"Nenhum objeto mensurável selecionado."}';
        }

        var wMm = Math.round((maxR - minL) * mm * 10) / 10;
        var hMm = Math.round((maxT - minB) * mm * 10) / 10;

        // Rejeita seleção vazia ou de tamanho inválido (regra R-013: !isFinite || <= 0)
        if (!isFinite(wMm) || !isFinite(hMm) || wMm <= 0 || hMm <= 0) {
            return '{"selection":false,"message":"Seleção com tamanho inválido."}';
        }
        return '{"selection":true,"widthMm":' + wMm + ',"heightMm":' + hMm + '}';
    } catch (e) {
        return '{"selection":false,"message":"' + escapeJson(e.message) + '"}';
    }
}

// ── Listener de seleção → painel (requestAnimationFrame-like via CSXSEvent) ──

var _selectionDoc = null;
var _selectionHandlersBound = false;

function ensureSelectionEvents() {
    try {
        var doc = app.activeDocument;
        if (!doc) return;
        if (_selectionHandlersBound && doc === _selectionDoc) return;

        if (_selectionHandlersBound && _selectionDoc && _selectionDoc.removeEventListener) {
            try { _selectionDoc.removeEventListener('selectionChanged', onSelectionChanged, false); } catch (e2) {}
        }

        doc.addEventListener('selectionChanged', onSelectionChanged, false);
        _selectionDoc = doc;
        _selectionHandlersBound = true;
    } catch (e) {
        _selectionHandlersBound = false;
    }
}

function ensurePlugPlugLoaded() {
    if (typeof CSXSEvent === 'undefined') {
        try {
            new ExternalObject("lib:PlugPlugExternalObject");
        } catch (e) {
            // Se o módulo nativo não estiver acessível, o polling do painel assume
        }
    }
}

function onSelectionChanged() {
    try {
        // Se trocou de documento ativo, re-registra o listener
        if (_selectionDoc !== app.activeDocument) ensureSelectionEvents();

        var raw = getSelectionBounds();
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return; }
        if (!parsed || !parsed.selection) return;

        ensurePlugPlugLoaded();
        if (typeof CSXSEvent !== 'undefined') {
            var evt = new CSXSEvent();
            evt.type = 'com.graficaos.imposer.selection';
            evt.data = JSON.stringify(parsed);
            evt.dispatch();
        }
    } catch (e) {
        // best-effort — nunca lança
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

function applyPlacementsToActiveDoc(plan, opt) {
    var keepArtboard = (typeof opt === 'object') ? (opt.keepArtboard !== undefined ? opt.keepArtboard : true) : opt;
    var mm2pt = 72.0 / 25.4;

    if (app.documents.length === 0) {
        throw new Error("Nenhum documento aberto no Illustrator.");
    }
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || sel.length === 0) {
        throw new Error("Selecione um objeto na bancada antes de impor.");
    }

    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var tempLayer = null;

    try {
        // Limpar qualquer camada temporária residual de execuções anteriores que falharam
        for (var tl = doc.layers.length - 1; tl >= 0; tl--) {
            try {
                var lName = doc.layers[tl].name;
                if (lName && lName.indexOf("Temp_GraficaOS_") === 0) {
                    var lRem = doc.layers[tl];
                    if (doc.activeLayer === lRem && doc.layers.length > 1) {
                        for (var cl = 0; cl < doc.layers.length; cl++) {
                            if (doc.layers[cl] !== lRem) {
                                doc.activeLayer = doc.layers[cl];
                                break;
                            }
                        }
                    }
                    unlockLayerChain(lRem);
                    lRem.remove();
                }
            } catch (eClean) {}
        }

        // Agrupar itens da seleção pela sua camada real
        var layersList = [];
        for (var i = 0; i < sel.length; i++) {
            var item = sel[i];
            try { item.locked = false; } catch (eIL) {}
            var lyr = item.layer;
            unlockLayerChain(lyr);

            var found = null;
            for (var k = 0; k < layersList.length; k++) {
                if (layersList[k].layer === lyr || layersList[k].name === lyr.name) {
                    found = layersList[k];
                    break;
                }
            }
            if (!found) {
                found = {
                    name: lyr.name,
                    layer: lyr,
                    items: []
                };
                layersList.push(found);
            }
            found.items.push(item);
        }

        // Desbloquear a camada ativa atual antes de adicionar a camada temporária
        if (doc.activeLayer) {
            unlockLayerChain(doc.activeLayer);
        }

        // Determinar coordenadas e redimensionamento da prancheta
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        var abRect = ab.artboardRect;
        var originX = abRect[0];
        var originY = abRect[1];
        var abW = Math.abs(abRect[2] - abRect[0]);
        var abH = Math.abs(abRect[1] - abRect[3]);

        // Centralização absoluta na prancheta ativa do Illustrator (ou alinhamento relativo para auto-ajuste)
        if (plan.placements && plan.placements.length > 0) {
            var minGX = 1e300, maxGX = -1e300, minGY = 1e300, maxGY = -1e300;
            for (var pi0 = 0; pi0 < plan.placements.length; pi0++) {
                var pl0 = plan.placements[pi0];
                var px0 = pl0.xMm * mm2pt;
                var py0 = pl0.yMm * mm2pt;
                var pw0 = pl0.widthMm * mm2pt;
                var ph0 = pl0.heightMm * mm2pt;
                if (px0 < minGX) minGX = px0;
                if (px0 + pw0 > maxGX) maxGX = px0 + pw0;
                if (py0 < minGY) minGY = py0;
                if (py0 + ph0 > maxGY) maxGY = py0 + ph0;
            }
            var gridTotalW = maxGX - minGX;
            var gridTotalH = maxGY - minGY;

            var centerDeltaX, centerDeltaY;
            if (keepArtboard) {
                var targetLeft = Math.max(0, (abW - gridTotalW) / 2.0);
                var targetTop = Math.max(0, (abH - gridTotalH) / 2.0);
                centerDeltaX = targetLeft - minGX;
                centerDeltaY = targetTop - minGY;
            } else {
                centerDeltaX = -minGX;
                centerDeltaY = -minGY;
            }

            // Atualiza plan.placements para que marcas, guias e posições usem o mesmo centro/referência
            for (var pi0 = 0; pi0 < plan.placements.length; pi0++) {
                plan.placements[pi0].xMm += (centerDeltaX / mm2pt);
                plan.placements[pi0].yMm += (centerDeltaY / mm2pt);
            }
        }

        // Criar camada temporária segura
        tempLayer = doc.layers.add();
        tempLayer.name = "Temp_GraficaOS_" + new Date().getTime();
        tempLayer.locked = false;
        tempLayer.visible = true;

        var maxCopias = plan.grid.plannedUnits;
        var geradas = 0;

        // Cache dos deltas de alinhamento com a máscara (calculados por ângulo para não penalizar performance)
        var offsetCache = {};

        for (var pi = 0; pi < plan.placements.length; pi++) {
            if (geradas >= maxCopias) break;

            var p = plan.placements[pi];
            var targetX = originX + (p.xMm * mm2pt);
            var targetY = originY - (p.yMm * mm2pt);
            var cellW = p.widthMm * mm2pt;
            var cellH = p.heightMm * mm2pt;

            var masterGroup = tempLayer.groupItems.add();

            var subPairs = [];
            for (var li = 0; li < layersList.length; li++) {
                var lEntry = layersList[li];
                var subGroup = masterGroup.groupItems.add();
                var itemsToDup = lEntry.items;
                for (var it = 0; it < itemsToDup.length; it++) {
                    var itm = itemsToDup[it];
                    try { itm.locked = false; } catch (eLD) {}
                    itm.duplicate(subGroup, ElementPlacement.PLACEATEND);
                }
                subPairs.push({ sub: subGroup, targetLayer: lEntry.layer });
            }

            // Orientação Preps (Head to Head, Foot to Foot, Head to Foot)
            var isHeadFootRotated = false;
            if (opt && opt.headFoot === "head_to_head") {
                if (p.row % 2 === 1) isHeadFootRotated = true;
            } else if (opt && opt.headFoot === "foot_to_foot") {
                if (p.row % 2 === 0) isHeadFootRotated = true;
            }

            var totalRot = 0;
            if (p.rotated) totalRot -= 90;
            if (isHeadFootRotated) totalRot += 180;

            if (totalRot !== 0) {
                masterGroup.rotate(totalRot, true, true, true, true, Transformation.CENTER);
            }

            // Centralizar a arte dentro da célula teórica respeitando limites visuais / máscaras de corte
            var rotKey = "r_" + totalRot;
            var off = offsetCache[rotKey];
            if (!off) {
                var mgb = getItemVisibleBounds(masterGroup);
                if (mgb) {
                    off = {
                        visW: Math.abs(mgb[2] - mgb[0]),
                        visH: Math.abs(mgb[1] - mgb[3]),
                        deltaLeft: masterGroup.left - mgb[0],
                        deltaTop: masterGroup.top - mgb[1]
                    };
                } else {
                    off = {
                        visW: masterGroup.width,
                        visH: masterGroup.height,
                        deltaLeft: 0,
                        deltaTop: 0
                    };
                }
                offsetCache[rotKey] = off;
            }

            var desiredLeft = targetX - (off.visW - cellW) / 2.0;
            var desiredTop = targetY + (off.visH - cellH) / 2.0;
            masterGroup.left = desiredLeft + off.deltaLeft;
            masterGroup.top = desiredTop + off.deltaTop;

            // Distribuir itens de volta para as camadas de destino correspondentes
            for (var sp = 0; sp < subPairs.length; sp++) {
                var sub = subPairs[sp].sub;
                var tLayer = subPairs[sp].targetLayer;
                unlockLayerChain(tLayer);
                for (var pIdx = sub.pageItems.length - 1; pIdx >= 0; pIdx--) {
                    var pItem = sub.pageItems[pIdx];
                    try { pItem.locked = false; } catch (ePL) {}
                    pItem.move(tLayer, ElementPlacement.PLACEATEND);
                }
            }

            masterGroup.remove();
            geradas++;
        }

        // Trocar a camada ativa para outra antes de remover tempLayer
        if (doc.layers.length > 1) {
            for (var dl = 0; dl < doc.layers.length; dl++) {
                if (doc.layers[dl] !== tempLayer) {
                    doc.activeLayer = doc.layers[dl];
                    break;
                }
            }
        }
        if (tempLayer) {
            unlockLayerChain(tempLayer);
            try { tempLayer.remove(); tempLayer = null; } catch (eRemTL) {}
        }

        // Remover os itens originais selecionados
        for (var lr = 0; lr < layersList.length; lr++) {
            unlockLayerChain(layersList[lr].layer);
            var origItems = layersList[lr].items;
            for (var j = 0; j < origItems.length; j++) {
                try { origItems[j].locked = false; } catch (eOL) {}
                try { origItems[j].remove(); } catch (eOR) {}
            }
        }

        doc.views[0].zoom = 0.35;
        app.redraw();

    } finally {
        if (tempLayer) {
            try {
                if (doc.layers.length > 1) {
                    for (var fl = 0; fl < doc.layers.length; fl++) {
                        if (doc.layers[fl] !== tempLayer) {
                            doc.activeLayer = doc.layers[fl];
                            break;
                        }
                    }
                }
                unlockLayerChain(tempLayer);
                tempLayer.remove();
            } catch (eFinTL) {}
        }
        app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    }
}

// ── Moldura de Registro / Contorno da Chapa ────────────────────────

function drawMolduraFrame(plan, optionsArg) {
    var opt = (typeof optionsArg === "object" && optionsArg !== null) ? optionsArg : { keepArtboard: !!optionsArg };
    var keepArtboard = (opt.keepArtboard !== undefined) ? (opt.keepArtboard === true || opt.keepArtboard === "true") : true;
    var mm2pt = 72.0 / 25.4;
    var doc = app.activeDocument;

    // Se o tipo de marca for Mimaki, o nome da camada segue o padrão Mimaki FineCut: "FC Frame Layer"
    var isMimaki = (opt.marksType === "mimaki_finecut" || opt.marksType === "mimaki_fcrm");
    var layerName = isMimaki ? "FC Frame Layer" : "Moldura_Registro";

    var molduraLayer = null;
    try {
        molduraLayer = doc.layers.getByName(layerName);
    } catch (e1) {
        try {
            molduraLayer = doc.layers.getByName("Moldura_Registro");
        } catch (e2) {
            try {
                molduraLayer = doc.layers.getByName("Moldura");
            } catch (e3) {
                molduraLayer = null;
            }
        }
    }

    if (!molduraLayer) {
        if (doc.activeLayer) {
            unlockLayerChain(doc.activeLayer);
        }
        molduraLayer = doc.layers.add();
        molduraLayer.name = layerName;
    } else {
        molduraLayer.name = layerName;
    }

    // SEMPRE desbloquear e tornar visível ANTES de remover itens!
    unlockLayerChain(molduraLayer);

    for (var fIdx = molduraLayer.pageItems.length - 1; fIdx >= 0; fIdx--) {
        try { molduraLayer.pageItems[fIdx].locked = false; } catch (eFL) {}
        try { molduraLayer.pageItems[fIdx].remove(); } catch (eFR) {}
    }

    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var originX = ab ? ab.artboardRect[0] : 0;
    var originY = ab ? ab.artboardRect[1] : 0;

    var rectLeft, rectTop, rectWidth, rectHeight;

    if (keepArtboard && ab) {
        rectLeft = ab.artboardRect[0];
        rectTop = ab.artboardRect[1];
        rectWidth = Math.abs(ab.artboardRect[2] - ab.artboardRect[0]);
        rectHeight = Math.abs(ab.artboardRect[1] - ab.artboardRect[3]);
    } else if (plan.placements && plan.placements.length > 0) {
        var placements = plan.placements;
        var minX = placements[0].xMm;
        var minY = placements[0].yMm;
        var maxX = placements[0].xMm + placements[0].widthMm;
        var maxY = placements[0].yMm + placements[0].heightMm;

        for (var i = 1; i < placements.length; i++) {
            var pp = placements[i];
            if (pp.xMm < minX) minX = pp.xMm;
            if (pp.yMm < minY) minY = pp.yMm;
            if (pp.xMm + pp.widthMm > maxX) maxX = pp.xMm + pp.widthMm;
            if (pp.yMm + pp.heightMm > maxY) maxY = pp.yMm + pp.heightMm;
        }

        var marginMm = (opt.marginMm !== undefined && isFinite(opt.marginMm) && opt.marginMm > 0) ? opt.marginMm : 0;
        var marginPt = marginMm * mm2pt;

        rectLeft = originX + (minX * mm2pt) - marginPt;
        rectTop = originY - (minY * mm2pt) + marginPt;
        rectWidth = ((maxX - minX) * mm2pt) + (2.0 * marginPt);
        rectHeight = ((maxY - minY) * mm2pt) + (2.0 * marginPt);
    } else if (plan.sheet && isFinite(plan.sheet.widthMm) && isFinite(plan.sheet.heightMm) && plan.sheet.widthMm > 0 && plan.sheet.heightMm > 0) {
        rectLeft = originX;
        rectTop = originY;
        rectWidth = plan.sheet.widthMm * mm2pt;
        rectHeight = plan.sheet.heightMm * mm2pt;
    } else {
        return;
    }

    var frameRect = molduraLayer.pathItems.rectangle(rectTop, rectLeft, rectWidth, rectHeight);
    frameRect.filled = false;
    frameRect.stroked = true;
    frameRect.strokeWidth = 0.5;

    // Se Mimaki, anexar tag nativa FineCut
    if (isMimaki) {
        try {
            var tFrame = frameRect.tags.add();
            tFrame.name = "MimakiFineCutExtractFrameTag";
            tFrame.value = "1";
        } catch (eTF) {}
    }

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

// ── Auto-Ajuste da Prancheta (Fit Artboard to Content) ───────────────

function fitArtboardToContent(plan, opt) {
    try {
        var doc = app.activeDocument;
        var abIdx = doc.artboards.getActiveArtboardIndex();
        var ab = doc.artboards[abIdx];
        var targetBounds = null;

        // 1. Prioridade: Se moldura foi gerada, alinha exatamente no tamanho da moldura
        if (opt.marksType === "moldura" || opt.shouldDrawFrame === true) {
            var molduraLayer = null;
            try { molduraLayer = doc.layers.getByName("Moldura_Registro"); } catch (eM1) {
                try { molduraLayer = doc.layers.getByName("FC Frame Layer"); } catch (eM2) {}
            }
            if (molduraLayer && molduraLayer.pageItems.length > 0) {
                targetBounds = getLayerVisibleBounds(molduraLayer);
            }
        }

        // 2. Prioridade: Se marcas Mimaki foram geradas, alinha no tamanho das marcas
        if (!targetBounds && (opt.marksType === "mimaki_finecut" || opt.marksType === "mimaki_fcrm")) {
            var mimakiLayers = [];
            try { mimakiLayers.push(doc.layers.getByName("FC RegisterMark Layer")); } catch (eML1) {}
            try { mimakiLayers.push(doc.layers.getByName("FC Frame Layer")); } catch (eML2) {}
            targetBounds = getLayersUnionBounds(mimakiLayers);
        }

        // 3. Prioridade: Se marcas Preps foram geradas, alinha no tamanho das marcas
        if (!targetBounds && (opt.marksType === "preps_sample_group" || opt.marksType === "preps_cropmarks")) {
            var prepsLayers = [];
            try { prepsLayers.push(doc.layers.getByName("Marcas_Corte")); } catch (ePL1) {}
            try { prepsLayers.push(doc.layers.getByName("Marcas_ColorBar")); } catch (ePL2) {}
            try { prepsLayers.push(doc.layers.getByName("Marcas_Slugline")); } catch (ePL3) {}
            targetBounds = getLayersUnionBounds(prepsLayers);
        }

        // 4. Fallback: Se nenhuma marca ou moldura, alinha nos limites da arte imposta
        if (!targetBounds) {
            targetBounds = getArtworkGridBounds(plan, ab);
        }

        if (targetBounds && targetBounds.length === 4) {
            // [left, top, right, bottom]
            ab.artboardRect = [targetBounds[0], targetBounds[1], targetBounds[2], targetBounds[3]];
        }
    } catch (eFit) {}
}

function getLayerVisibleBounds(layer) {
    if (!layer || layer.pageItems.length === 0) return null;
    return getItemsVisibleBounds(layer.pageItems);
}

function getLayersUnionBounds(layers) {
    var allItems = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l && l.pageItems.length > 0) {
            for (var j = 0; j < l.pageItems.length; j++) {
                allItems.push(l.pageItems[j]);
            }
        }
    }
    if (allItems.length === 0) return null;
    return getItemsVisibleBounds(allItems);
}

function getItemsVisibleBounds(items) {
    if (!items || items.length === 0) return null;
    var minX = 1e300, maxY = -1e300, maxX = -1e300, minY = 1e300;
    var found = false;
    for (var i = 0; i < items.length; i++) {
        try {
            var b = items[i].visibleBounds;
            if (b && b.length === 4 && isFinite(b[0]) && isFinite(b[1]) && isFinite(b[2]) && isFinite(b[3])) {
                if (b[0] < minX) minX = b[0];
                if (b[1] > maxY) maxY = b[1];
                if (b[2] > maxX) maxX = b[2];
                if (b[3] < minY) minY = b[3];
                found = true;
            }
        } catch (eB) {}
    }
    return found ? [minX, maxY, maxX, minY] : null;
}

function getArtworkGridBounds(plan, ab) {
    if (!plan || !plan.placements || plan.placements.length === 0) return null;
    var mm2pt = 72.0 / 25.4;
    var originX = ab ? ab.artboardRect[0] : 0;
    var originY = ab ? ab.artboardRect[1] : 0;
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
    return [minX, maxY, maxX, minY];
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

// Registrar listener de seleção na inicialização (best-effort)
try { ensureSelectionEvents(); } catch (e) { /* se falhar, o painel lê na troca de aba/ação */ }

// Exposição explícita no escopo global ExtendScript ($) para o CEP
$.getActiveArtboardBounds = getActiveArtboardBounds;
$.applyComputedPlan = applyComputedPlan;
$.getSelectionBounds = getSelectionBounds;
$.drawPrepsSmartMarks = drawPrepsSmartMarks;
$.drawMolduraFrame = drawMolduraFrame;
$.fitArtboardToContent = fitArtboardToContent;
$.pickPdfFile = pickPdfFile;
$._graficaos_engine_loaded = true;

