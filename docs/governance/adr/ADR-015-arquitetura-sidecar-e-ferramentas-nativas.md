# ADR-015: Arquitetura Sidecar e Ferramentas Nativas (ImpositorKonica WPF)

- **Status:** Aprovado
- **Data:** 2026-09-15
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** Desktop / Pre-press / Imposition
- **Links:** Cita `BR-010`, `BR-021`; complementa `ADR-014` e `ADR-009`
- **Executável Alvo:** `sidecars/ImpositorKonica/bin/Release/net8.0-windows/win-x64/publish/ImpositorKonica.exe`

---

## Contexto e Problema

O GraficaOS é uma aplicação de gerenciamento gráfico e chão de fábrica desenvolvida com frontend web moderno (React/Next.js) empacotado em desktop via Electron.

Para a rotina de pré-impressão e montagem de chapas na impressora digital **Konica Minolta bizhub PRO/PRESS** (folha física SRA3 de **330 × 480 mm** com etiquetas de **90 × 35 mm**), a experiência do operador demanda:
1. **Ergonomia e Memória Muscular Gráfica:** Manipulação fluida em 60 FPS com pan, zoom focalizado e atalhos consagrados na indústria gráfica (`F4` Zoom Extents, `P` Centralizar, `C`/`E` Alinhar centros, `Ctrl+D` Duplicar com gap).
2. **Alta Densidade e Performance Vetorial:** Renderização instantânea de dezenas de matrizes de etiquetas com contornos de corte de 1pt, fios de sangria e QR Codes vetoriais sem o peso de nós no DOM HTML ou engasgos de Garbage Collection (GC) do V8/Chromium.
3. **Comunicação Direta com o Subsistema de Impressão do Windows:** Controle fino de orientação de alimentação (boca de 330 mm), gramatura de papel autoadesivo e seleção direta de fila de impressão sem diálogos intermediários e imprevisíveis do navegador.

Tentar executar uma mesa gráfica pesada exclusivamente dentro da thread de renderização do Electron introduz limitações de memória, bloqueio de fila de eventos e complexidade no empacotamento.

---

## Decisão

Adotamos a **Arquitetura Sidecar (Processos Nativos Desacoplados)** para ferramentas especializadas de alta demanda gráfica e interação direta com o hardware.

### 1. Stack e Tecnologia do Sidecar
- **Linguagem & Framework:** C# (.NET 8 WPF - Windows Presentation Foundation).
- **Aceleração Gráfica:** Renderização direta em GPU via pipeline DirectX / `DrawingContext` sobre um componente customizado (`FrameworkElement`), **sem instanciar elementos da árvore visual WPF (`Button`, `Grid`)** para cada etiqueta da folha.
- **Distribuição:** Binário único autocontido (*Self-Contained Single-File Executable*), compilado com target `win-x64`, eliminando a necessidade de pré-instalação de runtimes .NET no Windows do cliente.

### 2. Protocolo de Comunicação e Ciclo de Vida (Electron ↔ Sidecar)
1. O processo Renderer do Electron solicita a abertura da mesa de imposição enviando o payload dos insumos via IPC (`imposition:open`).
2. O processo Main do Electron grava um arquivo JSON temporário atômico em `%TEMP%/imp_{timestamp}_{random}.json`.
3. O Electron dispara o executável via `child_process.spawn(exePath, ['--data', tempPath])`.
4. O `ImpositorKonica.exe` é iniciado, carrega o arquivo em memória, valida a integridade do contrato (`ImpositionContract`) e abre a janela maximizada em tema escuro (Studio Dark).
5. Ao concluir a montagem, o operador clica em "Enviar para Konica" (ou fecha a janela).
6. O executável encerra com códigos de saída (*Exit Codes*) estritamente padronizados.
7. O Electron captura o código de retorno, remove o arquivo temporário do disco e responde ao Renderer.

### 3. Tabela de Códigos de Saída (Exit Codes)
| Código | Significado | Ação no Electron |
| :---: | :--- | :--- |
| `0` | Sucesso total: chapa enviada para impressão ou salva | Notifica sucesso e registra log de produção |
| `1` | Cancelamento voluntário: operador fechou a janela sem imprimir | Operação cancelada; nenhum alerta de erro emitido |
| `2` | Falha de contrato: argumento `--data` ausente ou JSON corrompido | Alerta crítico no Electron para investigação de IPC |
| `3` | Erro do subsistema de impressão (`System.Printing` / Spooler) | Exibe erro ao operador solicitando verificar driver/impressora |

---

## Consequências

### Positivas
- **Desempenho Extremo:** 60 FPS contínuos e zoom sub-milimétrico com consumo de memória inferior a 50 MB de RAM.
- **Isolamento de Falhas:** Caso o processo de imposição falhe ou seja fechado, o Electron permanece completamente estável.
- **Fidelidade de Cor e Corte:** Fio de corte de 1pt contínuo renderizado diretamente como vetor nativo, garantindo precisão milimétrica na guilhotina e na Konica.
- **Zero Dependências no Host:** O executável é distribuído via `extraResources` do `electron-builder` como um executável autocontido.

### Negativas / Mitigações
- **Apenas Plataforma Windows:** Como o chão de fábrica opera em PCs Windows acoplados às impressoras digitais e CTP, a dependência de WPF/Windows é aceita e atende 100% do cenário produtivo.
- **Tamanho do Instalador:** O executável autocontido adiciona ~35-45 MB ao pacote instalador do Electron (mitigado pelo ganho de velocidade e robustez).

---

## Verificação

- O executável deve responder ao argumento `--data <path>` e fechar com código `0` após disparo de impressão.
- Sem o argumento `--data`, o executável deve inicializar em modo Demonstração/Mock para testes locais de desenvolvimento.
- Os arquivos temporários em `%TEMP%` devem ser removidos imediatamente após o fechamento do processo.
