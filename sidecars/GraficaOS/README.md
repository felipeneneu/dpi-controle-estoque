# GraficaOS Impositor

Solução construída em .NET 8 (WPF) com a UI de imposição gráfica, seguindo estritamente as especificações de densidade, padrão visual (Preps 9/Illustrator), e MVVM puro.

## Como rodar
1. Navegue até a pasta do aplicativo:
   `cd sidecars/GraficaOS/GraficaOS.App`
2. Rode o projeto:
   `dotnet run`

Ou simplesmente execute o binário compilado em:
`sidecars/GraficaOS/GraficaOS.App/bin/Debug/net8.0-windows/GraficaOS.App.exe`

## Onde plugar a lógica real?

O aplicativo foi construído com separação estrita usando o MVVM Toolkit (`CommunityToolkit.Mvvm`).
A interface (WPF) e os `ViewModels` vivem em `GraficaOS.App`.
A matemática real, a extração de páginas do PDF, e as estruturas vivem no `GraficaOS.Core`.

### 1. Motor de Imposição e Cálculo
A interface do "Cálculo Exato" atualiza o `ImpositionViewModel` que chama `IImposicaoService.Calcular` (localizado em `GraficaOS.Core/Services.cs`).
A matemática (Linhas * Colunas, etc.) já está implementada lá e passa nos testes do xUnit (`GraficaOS.Core.Tests`).

### 2. Geração da Chapa (Botão Preto)
O botão `GERAR CHAPA DE IMPRESSÃO` está no `MainWindow.xaml` e a regra de negócio pode ser inserida anexando um comando no `ImpositionViewModel` ou em um injetor que processe o `DocumentoPdf` atual com `PdfPig` / `PdfSharp`.

### 3. Extração do PDF Real
Há uma interface `IPdfImportService` no `GraficaOS.Core` com um `MockPdfImportService`. 
Para plugar a leitura de um PDF real (onde ele extrai Largura/Altura da TrimBox/MediaBox), você deve injetar uma implementação do `IPdfImportService` real no `GraficaOS.App/App.xaml.cs` (usando Microsoft.Extensions.DependencyInjection).
