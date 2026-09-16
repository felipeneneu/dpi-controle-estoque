#target illustrator

/**
 * Step & Repeat nativo do Illustrator com preservação estrita de camadas.
 * Pode ser executado com parâmetros padrão ou via injeção dinâmica do Electron.
 */
function runStepAndRepeatByLayers(cols, rows, widthMm, heightMm, gapMm) {
    if (app.documents.length === 0) {
        alert("[GraficaOS] Abra o arquivo no Illustrator antes de executar.");
        return;
    }

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        alert("[GraficaOS] Selecione a arte base (contendo Faca, Cor e Branco) antes de acionar.");
        return;
    }

    var mmToPt = 72.0 / 25.4;
    var stepX = (widthMm + gapMm) * mmToPt;
    var stepY = (heightMm + gapMm) * mmToPt;

    // 1. Mapeia cada objeto selecionado para o nome da sua camada de origem
    var itemsByLayer = {};
    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        var layerName = item.layer.name;
        if (!itemsByLayer[layerName]) {
            itemsByLayer[layerName] = [];
        }
        itemsByLayer[layerName].push(item);
    }

    // 2. Duplica objeto por objeto dentro da sua camada original
    for (var layerName in itemsByLayer) {
        if (!itemsByLayer.hasOwnProperty(layerName)) continue;

        var layerItems = itemsByLayer[layerName];
        var targetLayer = doc.layers.getByName(layerName);

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                if (r === 0 && c === 0) continue; // Pula a arte original já posicionada

                var offsetX = c * stepX;
                var offsetY = -(r * stepY); // Eixo Y desce negativo no Illustrator

                for (var k = 0; k < layerItems.length; k++) {
                    var originalItem = layerItems[k];
                    var duplicateItem = originalItem.duplicate(targetLayer, ElementPlacement.PLACEATEND);
                    duplicateItem.translate(offsetX, offsetY);
                }
            }
        }
    }
}

// Parâmetros de fábrica testados (35 colunas x 29 linhas = 1015 peças, 19x34mm, Gap 0)
runStepAndRepeatByLayers(35, 29, 19, 34, 0);
