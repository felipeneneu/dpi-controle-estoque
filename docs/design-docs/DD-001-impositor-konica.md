# Design Doc 001 — Módulo Sidecar: Impositor Gráfico SRA3 para Konica Minolta

- **Status:** Aprovado
- **Data de Criação:** 2026-09-15
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **ADR Relacionada:** `ADR-015`
- **Executável Alvo:** `sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe`

---

## 1. Visão Geral e Motivação

O **Impositor Konica** é uma ferramenta de apoio visual e operacional voltada para o chão de fábrica, responsável por receber lotes de bobinas e tintas cadastradas no GraficaOS e organizá-las sobre uma folha física de formato SRA3 (**330 × 480 mm**). O objetivo é gerar matrizes de etiquetas de **90 × 35 mm** para impressão em folha adesiva na impressora digital Konica Minolta, com marcas de corte individuais de 1pt.

Para que a ferramenta seja produtiva na mão do operador gráfico, ela deve replicar a precisão e a ergonomia de ferramentas consagradas de imposição (Kodak Preps) e editoração vetorial (CorelDRAW), superando as restrições de escala e eventos do navegador.

---

## 2. Requisitos do Sistema

### 2.1 Funcionais
* **Mesa de Montagem Métrica 1:1:** Área de trabalho em espaço milimétrico exato, representando a folha de 330 × 480 mm.
* **Composições de Imposição:**
  * *Vertical / 90° (Padrão):* Grade $8 \times 5 = 40$ etiquetas por folha (dimensões de cada slot: $35 \times 90 \text{ mm}$).
  * *Horizontal / 0°:* Grade $3 \times 12 = 36$ etiquetas por folha (dimensões de cada slot: $90 \times 35 \text{ mm}$).
* **Margens e Sangrias:** Margem de segurança de fábrica de 5 mm e espaçamento entre etiquetas (*gap*) configurável de 3 mm.
* **Modos de Operação:**
  * *Step & Repeat:* Preenchimento em grade automática uniforme.
  * *AutoGang:* Algoritmo de empacotamento com guilhotina linear contínua para múltiplos insumos.
  * *Montagem Manual:* Posicionamento livre de etiquetas com atração magnética (*snapping*).
* **Marcas Gráficas Industriais:**
  * Borda perimetral preta de 1pt em cada etiqueta (guia de corte ou meio-corte).
  * Fios de corte (*crop marks*) externos de 0,25pt.
  * Slug line técnico com data, operador, máquina de destino e códigos contidos.
* **Disparo de Saída:** Geração de PDF vetorial normalizado e envio direto para a fila de impressão do Windows (`System.Printing`).

### 2.2 Não-Funcionais (Performance e UX)
* **Taxa de Quadros:** 60 FPS contínuos durante operações de pan e zoom.
* **Consumo de Memória:** Inferior a 50 MB de RAM.
* **Inicialização:** Abertura da janela em menos de 400 ms a partir do acionamento no Electron.
* **Distribuição:** Executável único autocontido (*Single-File Binary*), dispensando instalação prévia de runtimes.

---

## 3. Arquitetura e Contrato de Integração (IPC / CLI)

O Electron atua como orquestrador, iniciando o executável como processo filho e passando o caminho de um arquivo JSON estruturado via argumento de linha de comando.

### 3.1 Diagrama de Sequência
```text
[ Electron Renderer ] ──(IPC: imposition:open)──► [ Electron Main ]
                                                         │
                                            Grava %TEMP%/imp_XXXX.json
                                                         │
                                            child_process.spawn(exe, ['--data', path])
                                                         ▼
                                              [ ImpositorKonica.exe ]
                                                         │
                                                Operador monta / ajusta
                                                         │
                                            Dispara Konica ou Salva PDF
                                                         │
                                                    Fecha Janela
                                                         ▼
[ Electron Renderer ] ◄──(Notifica status)───── [ Electron Main ]
                                                         │
                                                Exclui arquivo temporário
```

### 3.2 Esquema do Arquivo JSON (`ImpositionContract.cs`)
```json
{
  "sheetWidthMm": 330.0,
  "sheetHeightMm": 480.0,
  "marginMm": 5.0,
  "gapMm": 3.0,
  "defaultRotation": 90,
  "operatorName": "Felipe",
  "machineTarget": "Konica Minolta bizhub PRO",
  "createdAt": "2026-09-15T16:00:00Z",
  "items": [
    {
      "id": "bob-1042",
      "code": "#1042",
      "title": "Bobina Vinil Adesivo 1.37m",
      "subtitle": "1.37m · Brilho",
      "details": "50m · Estoque Central",
      "type": "bobina",
      "qrPayload": "BOB:1042",
      "initialQuantity": 20
    }
  ]
}
```

### 3.3 Códigos de Saída do Executável (Exit Codes)
* `0`: Sucesso total. Trabalho enviado para impressão na Konica ou exportado.
* `1`: Cancelamento voluntário do operador (fechamento manual sem imprimir).
* `2`: Argumento inválido ou falha de leitura/desserialização do arquivo JSON.
* `3`: Falha crítica de comunicação com o spooler de impressão do Windows (`System.Printing`).

---

## 4. Motor Gráfico de Alta Performance (`CanvasImposicao`)

### 4.1 Pipeline de Renderização em GPU
- Herança direta de `FrameworkElement` e sobrescrita de `OnRender(DrawingContext dc)`.
- **Zero elementos visuais pesados na árvore:** nenhuma `Grid`, `Button` ou `Border` é instanciada para os slots da folha. Tudo é desenhado como primitivas de geometria vetorial diretamente na GPU.
- **Espaço Métrico 1:1:** O mundo virtual trabalha nativamente na escala $1\text{ unidade} = 1\text{ mm}$.

### 4.2 Transformação e Matriz de Projeção (`MatrixTransform`)
- A navegação é controlada por uma `Matrix` afim acumulando rotações, escala e translação.
- **Zoom Focalizado:** O zoom multiplica a matriz centralizado na coordenada do cursor (`Point mousePos = e.GetPosition(this)`), garantindo que a chapa não salte para fora da visão.
- **Pan Contínuo:** Arrastar com o botão direito ou `Espaço + Botão Esquerdo` atualiza os deltas $dX$ e $dY$ da matriz.

### 4.3 QR Code Vetorial com `QRCoder`
- Em vez de gerar imagens bitmap (PNG/BMP), o componente utiliza a biblioteca `QRCoder` para gerar uma malha vetorial `StreamGeometry` preenchida com `dc.DrawGeometry(Brushes.Black, null, geometry)`.
- Garante nitidez absoluta na saída de 1200 DPI da Konica Minolta.

---

## 5. Ergonomia e Teclas de Atalho (Memória Muscular Gráfica)

O operador de pré-impressão utiliza atalhos consagrados de software de editoração (CorelDRAW / Preps):

| Tecla | Ação |
| :---: | :--- |
| `F4` | **Zoom Extents:** Enquadra e centraliza a folha de 330 × 480 mm na janela atual. |
| `P` | **Centralizar na Folha:** Move a seleção para o centro geométrico da chapa. |
| `C` | **Alinhamento Centro Vertical:** Alinha os centros horizontais dos elementos selecionados. |
| `E` | **Alinhamento Centro Horizontal:** Alinha os centros verticais dos elementos selecionados. |
| `T` | **Alinhar ao Topo:** Ajusta o topo dos itens à margem superior (5 mm). |
| `B` | **Alinhar à Base:** Ajusta a base dos itens à margem inferior. |
| `L` | **Alinhar à Esquerda:** Ajusta a lateral esquerda dos itens à margem esquerda. |
| `R` | **Alinhar à Direita:** Ajusta a lateral direita dos itens à margem direita. |
| `Ctrl + D` | **Duplicar com Gap:** Clona o item selecionado e o posiciona no próximo slot respeitando o gap configurado (padrão 3 mm). |
| `Delete` | **Remover:** Remove a etiqueta selecionada da mesa. |
| `Esc` | **Cancelar:** Encerra o aplicativo com código 1. |

---

## 6. Empacotamento e Distribuição Electron

1. O projeto C# é compilado e publicado como executável único autocontido:
   ```powershell
   dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true
   ```
2. O artefato binário gerado (`ImpositorKonica.exe`) é copiado ou mapeado no `electron-builder.yml` através de `extraResources` para a pasta de distribuição `bin/ImpositorKonica.exe`.
3. No ambiente empacotado, o Electron invoca o executável a partir de `path.join(process.resourcesPath, 'bin', 'ImpositorKonica.exe')`.