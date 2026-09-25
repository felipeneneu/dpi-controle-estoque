#target illustrator

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

// ── GraficaOS Imposer — impose.jsx ──
// Rotina ExtendScript (ES3) do painel CEP: apenas operações de DOM do
// Illustrator. O motor COM é invocado pelo painel via probe WSH (cscript),
// porque o ExtendScript 4.5.x do Illustrator não expõe ActiveXObject.
// Todas as funções recebem/retornam strings JSON.

// ── Funções chamadas pelo painel CEP ────────────────────────────────

function applyComputedPlan(json) {
    try {
        var result = parseJson(json);

        if (!result.success) return json;
        if (!result.placements || result.placements.length === 0) {
            return '{"success":false,"errorCode":"E_NO_PLACEMENTS","message":"Plano sem posicoes."}';
        }

        applyPlacementsToActiveDoc(result);
        drawFineCutFrame(result);

        return '{"success":true,"placementCount":' + result.placements.length + ',"message":"Bancada aplicada."}';
    } catch (e) {
        return '{"success":false,"errorCode":"E_APPLY","message":"' + escapeJson(e.message) + '"}';
    }
}

// ── Medidas da seleção ──────────────────────────────────────────────

function getSelectionBounds() {
    try {
        var d = app.activeDocument;
        if (!d) return '{"selection":false,"message":"Nenhum documento aberto."}';
        var sel = d.selection;
        if (!sel || sel.length === 0) return '{"selection":false,"message":"Nenhum objeto selecionado."}';

        var mm = 25.4 / 72;
        var minL = 1e300, maxR = -1e300, maxT = -1e300, minB = 1e300;
        for (var i = 0; i < sel.length; i++) {
            var gb = sel[i].geometricBounds; // [left, top, right, bottom] em pontos
            if (gb[0] < minL) minL = gb[0];
            if (gb[2] > maxR) maxR = gb[2];
            if (gb[1] > maxT) maxT = gb[1];
            if (gb[3] < minB) minB = gb[3];
        }

        var wMm = Math.round((Math.abs(maxR - minL)) * mm * 10) / 10;
        var hMm = Math.round((Math.abs(maxT - minB)) * mm * 10) / 10;

        // Rejeita seleção vazia ou de tamanho inválido (ex.: flip com left > right, ponto isolado)
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

function applyPlacementsToActiveDoc(plan) {
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

    try {
        var itemsByLayer = {};
        for (var i = 0; i < sel.length; i++) {
            var item = sel[i];
            var layerName = item.layer.name;
            if (!itemsByLayer[layerName]) itemsByLayer[layerName] = [];
            itemsByLayer[layerName].push(item);
        }

        // Redimensionar prancheta conforme plano do motor
        var sheetW = plan.sheet.widthMm * mm2pt;
        var sheetH = plan.sheet.heightMm * mm2pt;
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
        ab.artboardRect = [0, 0, sheetW, -sheetH];

        var tempLayer = doc.layers.add();
        tempLayer.name = "Temp_GraficaOS_" + new Date().getTime();

        var maxCopias = plan.grid.plannedUnits;
        var geradas = 0;

        for (var pi = 0; pi < plan.placements.length; pi++) {
            if (geradas >= maxCopias) break;

            var p = plan.placements[pi];
            var targetX = p.xMm * mm2pt;
            var targetY = -(p.yMm * mm2pt);
            var cellW = p.widthMm * mm2pt;
            var cellH = p.heightMm * mm2pt;

            var masterGroup = tempLayer.groupItems.add();

            for (var ln in itemsByLayer) {
                if (!itemsByLayer.hasOwnProperty(ln)) continue;
                var subGroup = masterGroup.groupItems.add();
                subGroup.name = "Layer_" + ln;
                var layerItems = itemsByLayer[ln];
                for (var li = 0; li < layerItems.length; li++) {
                    layerItems[li].duplicate(subGroup, ElementPlacement.PLACEATEND);
                }
            }

            if (p.rotated) {
                masterGroup.rotate(-90, true, true, true, true, Transformation.CENTER);
            }

            // Centralizar a arte (com possível sangria) dentro da célula teórica de imposição
            masterGroup.left = targetX - (masterGroup.width - cellW) / 2.0;
            masterGroup.top = targetY + (masterGroup.height - cellH) / 2.0;

            for (var s = masterGroup.groupItems.length - 1; s >= 0; s--) {
                var sub = masterGroup.groupItems[s];
                var origLayerName = sub.name.replace(/^Layer_/, "");
                var targetLayer = doc.layers.getByName(origLayerName);
                
                while (sub.pageItems.length > 0) {
                    sub.pageItems[0].move(targetLayer, ElementPlacement.PLACEATEND);
                }
            }
            masterGroup.remove();
            geradas++;
        }

        tempLayer.remove();
        
        for (var lName in itemsByLayer) {
            if (!itemsByLayer.hasOwnProperty(lName)) continue;
            var origItems = itemsByLayer[lName];
            for (var j = 0; j < origItems.length; j++) {
                origItems[j].remove();
            }
        }

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

// Registrar listener de seleção na inicialização (best-effort)
try { ensureSelectionEvents(); } catch (e) { /* se falhar, o painel lê na troca de aba/ação */ }
