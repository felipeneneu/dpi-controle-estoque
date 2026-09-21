# ADR-042: Evolução de "Mesa de Etiquetas" para "Mesa de Imposição Profissional"

## Status
Aprovado

## Contexto e Problema
O `ImpositorKonica` foi inicialmente concebido como uma "mesa de etiquetas" ou painel simples. No entanto, o fluxo real de trabalho do operador de pré-impressão em máquinas industriais (Konica, Mimaki, HP Latex) exige ferramentas comparáveis a softwares de mercado (como Kodak Preps e Adobe Illustrator). O operador necessitava visualizar a arte do PDF, sobrepor a grade matemática calculada em tempo real, configurar marcas de corte para guilhotina ou plotter de recorte (Mimaki Split), e validar a capacidade da chapa/rolo antes de ordenar o RIP do PDF. Sem isso, o operador gasta tempo em tentativa e erro.

## Decisão
Pivotamos oficialmente o escopo do utilitário para uma **Mesa de Imposição**, implementando um conjunto robusto de ferramentas e UX técnica:

1. **Estratégia de UI/UX (Tema Studio / Brutalista)**
   - Adotar densidade compacta, cantos retos (`CornerRadius=0`), painéis rígidos (ferramentas à esquerda, cálculo à direita, canvas no centro) e cores funcionais. O estilo visual e ergonômico reflete softwares comerciais de pré-impressão.
   - Adoção dos atalhos de mercado (F4 para Zoom Extents, P/C/E para centralização, H para pan, V para seleção).

2. **Renderização de PDF Híbrida (Bitmap + WPF DrawingContext)**
   - Para evitar o *Airspace Issue* nativo ao usar controles WinForms (`PdfiumViewer`) dentro do WPF, o motor de renderização rasteriza a página do PDF na memória e injeta no WPF como um `ImageSource`. O `DrawingContext` (ou equivalente no WPF) atua na mesma camada, desenhando as linhas do Grid e Marcas com overlay exato e fluidez de GPU sem sobreposição destrutiva.

3. **Arquitetura C# MVVM Estrita (Core Desacoplado)**
   - Divisão em projetos (`GraficaOS.App`, `GraficaOS.Core`, `GraficaOS.Core.Tests`).
   - Todos os cálculos geométricos (cálculo de Largura/Altura da Grade com Sangria e Espaçamento) vivem no `Core` e não conhecem `System.Windows`.

4. **Persistência de Estado (Local JSON)**
   - Armazenar as configurações (Máquina ativa, Presets de Clientes) em arquivos JSON isolados, permitindo importação/exportação e controle de versão via Git ("Receitas de imposição").

## Consequências

### Positivas
* **Previsibilidade Absoluta:** O operador aprova visualmente o que vai sair na impressão antes de onerar a rede ou a RIP station.
* **Familiaridade:** A interface não requer retreinamento, pois espelha os jargões e atalhos da Adobe/Kodak.
* **Escalabilidade Técnica:** `GraficaOS.Core` pode ser testado por testes unitários e acionado por robôs (via AutoImposerCLI), garantindo que UI e Backend headless produzam 100% o mesmo cálculo.

### Negativas / Riscos
* **Custo de Memória (RAM):** Rasterizar PDFs com alta complexidade vetorial para um `ImageSource` em alta resolução na visualização pode criar picos de memória que exigirão lazy loading, mipmapping ou resoluções reduzidas durante o Pan.
* **Manutenção do Zoom/Pan:** Lidar com transformações de matrizes matemáticas 2D exige muito código customizado no WPF em comparação a uma renderização simples via DOM/Web.
