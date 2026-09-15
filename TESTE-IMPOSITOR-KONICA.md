# Guia de Teste: Sidecar Nativo ImpositorKonica (C# .NET 8 WPF)

> **Documento:** Roteiro Prático de Testes e Validação do Sidecar de Imposição Gráfica  
> **Governança:** [ADR-015](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/docs/governance/adr/ADR-015-arquitetura-sidecar-e-ferramentas-nativas.md) | [DD-001](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/docs/design-docs/DD-001-impositor-konica.md)  
> **Target:** Konica Minolta SRA3 (330 × 480 mm) | Etiquetas 90 × 35 mm  

---

## 📌 1. Visão Geral

O **ImpositorKonica** é uma ferramenta nativa Windows desenvolvida em **C# (.NET 8 WPF)** com aceleração gráfica direta via **DirectX (`DrawingContext`)**. Ele roda desacoplado do Electron pelo **Padrão Sidecar**, garantindo 60 FPS estáveis, renderização vetorial de QR Codes e comunicação direta com o spooler de impressão do Windows (`System.Printing`).

---

## ⚙️ 2. Pré-requisitos do Ambiente

O seu computador já possui o runtime de execução **.NET 8 Windows Desktop** instalado (`Microsoft.WindowsDesktop.App 8.0.6`).

Para compilar o código-fonte C# nesta máquina:
1. Abra o **PowerShell** e instale o SDK do .NET 8:
   ```powershell
   winget install Microsoft.DotNet.SDK.8
   ```
   *(Ou baixe o instalador oficial em: <https://dotnet.microsoft.com/download/dotnet/8.0>)*
2. **Feche e reabra o terminal** após a instalação para carregar as variáveis de ambiente (`PATH`).
3. Verifique se o compilador está pronto:
   ```powershell
   dotnet --version
   # Deve retornar 8.0.xxx
   ```

---

## 🔨 3. Passo a Passo: Compilação

Na raiz do projeto, navegue até a pasta do sidecar e compile:

### Opção A — Compilação para Produção (Executável Único Autocontido)
Gera o binário que será empacotado no Electron (`extraResources`):
```powershell
cd sidecars/ImpositorKonica
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true
```
*Executável gerado em:*  
`sidecars\ImpositorKonica\bin\Release\net8.0-windows\win-x64\publish\ImpositorKonica.exe`

### Opção B — Compilação Rápida para Desenvolvimento
```powershell
cd sidecars/ImpositorKonica
dotnet build
```
*Executável gerado em:*  
`sidecars\ImpositorKonica\bin\Debug\net8.0-windows\ImpositorKonica.exe`

---

## 🚀 4. Teste 1: Execução Standalone (Modo Mock / Isolado)

Você pode rodar e testar o executável diretamente, sem abrir o Electron. Quando iniciado sem argumentos, ele carrega dados de demonstração automaticamente:

```powershell
cd sidecars/ImpositorKonica
.\bin\Release\net8.0-windows\win-x64\publish\ImpositorKonica.exe
# ou se compilou em Debug:
.\bin\Debug\net8.0-windows\ImpositorKonica.exe
```

### O que validar na tela:
- [ ] **Zoom Focalizado:** Role o scroll do mouse sobre qualquer etiqueta — o zoom aproxima e afasta suavemente mantendo o cursor como ponto focal fixo.
- [ ] **Pan Contínuo:** Clique e arraste com o **botão direito do mouse** (ou segure `Espaço` + arraste com o botão esquerdo) para mover a folha SRA3 de 330 × 480 mm.
- [ ] **Enquadrar Folha (`F4`):** Pressione a tecla `F4` para ajustar e centralizar a folha inteira na janela (*Zoom Extents*).
- [ ] **⚡ AutoGang:** Clique no botão âmbar `⚡ AutoGang` no topo e confira o preenchimento automático das 40 posições da folha com os materiais da lista lateral.
- [ ] **Alternar Orientação:** Clique no botão no topo para alternar entre **Vertical (8×5 = 40 un)** e **Horizontal (3×12 = 36 un)**.
- [ ] **Adicionar Insumos:** Clique no botão `+` de qualquer item na barra lateral esquerda para inseri-lo no próximo slot livre.
- [ ] **Mover Etiquetas:** Clique em qualquer etiqueta na folha com o botão esquerdo e arraste-a para reposicioná-la livremente.
- [ ] **Fios de Corte:** Verifique se as linhas pretas de 1pt contínuas e as marcas de corte externas (*crop marks* de 0.25pt) estão visíveis com nitidez vetorial.
- [ ] **QR Code Vetorial:** Aponte o aplicativo leitor de QR Code do celular para a tela e confira a leitura imediata do payload (ex: `BOB:1042`).

---

## ⌨️ 5. Tabela de Atalhos de Memória Muscular (Preps / CorelDRAW)

Com a janela do Impositor aberta, teste os atalhos operacionais de teclado:

| Tecla | Ação | Comportamento Esperado |
| :---: | :--- | :--- |
| `F4` | **Zoom Extents** | Enquadra a folha SRA3 inteira centralizada na janela |
| `P` | **Centralizar na Folha** | Move os itens selecionados para o centro geométrico da chapa |
| `C` | **Alinhar Centros Verticais** | Alinha o eixo vertical de todos os itens selecionados |
| `E` | **Alinhar Centros Horizontais** | Alinha o eixo horizontal de todos os itens selecionados |
| `T` | **Alinhar ao Topo** | Move os itens para a margem superior de segurança (5 mm) |
| `B` | **Alinhar à Base** | Move os itens para a margem inferior da folha |
| `L` | **Alinhar à Esquerda** | Move os itens para a margem lateral esquerda |
| `R` | **Alinhar à Direita** | Move os itens para a margem lateral direita |
| `Ctrl + D` | **Duplicar com Gap** | Clona o item selecionado aplicando o espaçamento configurado (gap 3 mm) |
| `Delete` | **Remover** | Exclui as etiquetas selecionadas da mesa |
| `Esc` | **Cancelar** | Fecha a janela e encerra com código de saída `1` |

---

## 📋 6. Teste 2: Execução com Arquivo JSON via CLI (`--data`)

Criamos o arquivo de dados reais de teste em [`sidecars/ImpositorKonica/sample-payload.json`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/sidecars/ImpositorKonica/sample-payload.json).

Execute passando o caminho do arquivo:
```powershell
cd sidecars/ImpositorKonica
.\bin\Release\net8.0-windows\win-x64\publish\ImpositorKonica.exe --data "sample-payload.json"
```

Após fechar ou disparar a impressão, inspecione o código de retorno no terminal:
```powershell
$LASTEXITCODE
```

### Tabela de Códigos de Saída (Exit Codes):
- `0`: Trabalho impresso ou salvo com sucesso.
- `1`: Cancelamento voluntário do operador (fechamento manual ou `Esc` sem imprimir).
- `2`: Erro de validação de argumentos ou JSON corrompido.
- `3`: Erro de comunicação com o spooler de impressão do Windows (`System.Printing`).

---

## 🔌 7. Teste 3: Integração IPC com o Electron

Para testar o fluxo de disparo do processo nativo através do Node.js/Electron, execute o script de integração incluído no projeto:

```powershell
node electron/scripts/test-sidecar-ipc.js
```

### O que o script realiza:
1. Localiza automaticamente o caminho do executável `ImpositorKonica.exe`.
2. Cria um arquivo temporário em `%TEMP%/imp_XXXX.json` com o payload de teste.
3. Dispara o executável nativo via `child_process.spawn`.
4. Aguarda a finalização do processo, apaga o arquivo temporário com segurança e exibe o resultado:
   ```json
   {
     "success": true,
     "printed": true,
     "exitCode": 0
   }
   ```

---

## 💻 8. Como Disparar a partir do React no Electron

Nos componentes da interface (`grafica-app`), o canal IPC está exposto com segurança no objeto `window.grafica.imposition`:

```typescript
// Exemplo de acionamento em qualquer tela ou botão do GraficaOS:
async function handleAbrirImposicaoNativa() {
  try {
    const resultado = await window.grafica.imposition.open({
      sheetWidthMm: 330,
      sheetHeightMm: 480,
      marginMm: 5,
      gapMm: 3,
      defaultRotation: 90,
      operatorName: "Felipe",
      items: [
        {
          id: "bob-1042",
          code: "#1042",
          title: "Bobina Vinil Adesivo 1.37m",
          subtitle: "1.37m · Brilho",
          details: "50m · Estoque Central",
          type: "bobina",
          qrPayload: "BOB:1042",
          initialQuantity: 20
        },
        {
          id: "tnk-502",
          code: "#T-CY",
          title: "Tinta Cyan UV Mimaki",
          subtitle: "Cyan UV Original",
          details: "1000ml · Gaveta Tintas",
          type: "tinta",
          qrPayload: "TNK:502",
          initialQuantity: 20
        }
      ]
    });

    if (resultado.printed) {
      toast.success("Trabalho enviado para a Konica Minolta com sucesso!");
    } else if (resultado.exitCode === 1) {
      console.log("Operador fechou a mesa sem imprimir.");
    }
  } catch (error) {
    toast.error("Falha ao abrir a mesa de imposição nativa.");
  }
}
```
