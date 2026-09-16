#target illustrator

/**
 * Step & Repeat nativo do Illustrator com separação estrita de camadas.
 * Duplica os elementos selecionados mantendo cada vetor dentro da sua respectiva camada (Faca, Cor, Branco).
 */
(function main() {
    if (app.documents.length === 0) {
        alert("Abra o arquivo no Illustrator antes de executar o script.");
        return;
    }

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        alert("Selecione a arte base (com os elementos de todas as camadas) para multiplicar.");
        return;
    }

    // Diálogo de Parâmetros
    var dialog = new Window("dialog", "GraficaOS - Step & Repeat por Camadas");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];

    var panelConfig = dialog.add("panel", undefined, "Matriz de Repetição");
    panelConfig.orientation = "grid";
    panelConfig.numberOfColumns = 2;

    panelConfig.add("statictext", undefined, "Colunas (Largura):");
    var inputCols = panelConfig.add("edittext", undefined, "35");
    inputCols.characters = 6;

    panelConfig.add("statictext", undefined, "Linhas (Avanço):");
    var inputRows = panelConfig.add("edittext", undefined, "29");
    inputRows.characters = 6;

    panelConfig.add("statictext", undefined, "Largura Arte (mm):");
    var inputWidth = panelConfig.add("edittext", undefined, "19");
    inputWidth.characters = 6;

    panelConfig.add("statictext", undefined, "Altura Arte (mm):");
    var inputHeight = panelConfig.add("edittext", undefined, "34");
    inputHeight.characters = 6;

    panelConfig.add("statictext", undefined, "Gap / Espaçamento (mm):");
    var inputGap = panelConfig.add("edittext", undefined, "0");
    inputGap.characters = 6;

    var groupButtons = dialog.add("group");
    groupButtons.alignment = "right";
    var btnCancel = groupButtons.add("button", undefined, "Cancelar", { name: "cancel" });
    var btnOk = groupButtons.add("button", undefined, "Multiplicar Camadas", { name: "ok" });

    if (dialog.show() !== 1) return;

    var cols = parseInt(inputCols.text, 10);
    var rows = parseInt(inputRows.text, 10);
    var mmToPt = 72.0 / 25.4;
    var stepX = (parseFloat(inputWidth.text) + parseFloat(inputGap.text)) * mmToPt;
    var stepY = (parseFloat(inputHeight.text) + parseFloat(inputGap.text)) * mmToPt;

    // Agrupa objetos selecionados por camada de origem
    var itemsByLayer = {};
    for (var i = 0; i < selection.length; i++) {
        var item = selection[i];
        var layerName = item.layer.name;
        if (!itemsByLayer[layerName]) {
            itemsByLayer[layerName] = [];
        }
        itemsByLayer[layerName].push(item);
    }

    // Executa a duplicação camada por camada
    for (var layerName in itemsByLayer) {
        if (!itemsByLayer.hasOwnProperty(layerName)) continue;

        var layerItems = itemsByLayer[layerName];
        var targetLayer = doc.layers.getByName(layerName);

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                // Pula a peça original na coordenada (0,0)
                if (r === 0 && c === 0) continue;

                var offsetX = c * stepX;
                var offsetY = -(r * stepY); // Eixo Y no Illustrator desce negativo

                for (var k = 0; k < layerItems.length; k++) {
                    var originalItem = layerItems[k];
                    var duplicateItem = originalItem.duplicate(targetLayer, ElementPlacement.PLACEATEND);
                    duplicateItem.translate(offsetX, offsetY);
                }
            }
        }
    }

    alert("Sucesso!\nTotal de " + (cols * rows) + " cópias geradas mantendo a separação das camadas.");
})();
