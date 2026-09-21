---
name: canvas-rendering
description: High-performance 2D canvas rendering in WPF/Avalonia via DrawingContext, DrawingGroup, DirectX-backed rendering, and SkiaSharp. Covers 60 FPS interactive canvas with 1000+ elements, caching, DPI handling, and zoom/pan. Use for interactive tools like imposition tables.
when_to_use: "When building or optimizing interactive canvas with many elements. When 60 FPS is required. When DirectX or SkiaSharp is involved. NOT for simple Image display."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# canvas-rendering

## Filosofia
O canvas é **DirectX**, não DOM. Densidade de 1000+ elementos só com `DrawingContext`. Ao trabalhar com gráficos complexos, não utilize os painéis ou shapes do WPF diretamente.

## Custom FrameworkElement
Em vez de usar painéis prontos, crie a sua própria classe que herda de `FrameworkElement`.
- Faça o override do método `OnRender(DrawingContext dc)`.
- Chame `InvalidateVisual()` **apenas** quando algo realmente mudou. Redesenhar em cada frame sem necessidade destruirá a performance.
- Faça overrides de `MeasureOverride` e `ArrangeOverride` para fornecer o tamanho correto para o motor de layout do WPF, se necessário.

## DrawingContext — operações essenciais
- Primitivas: `DrawRectangle`, `DrawEllipse`, `DrawLine`.
- Formas complexas: `DrawGeometry` (combinado com `StreamGeometry`).
- Assets e agrupamentos: `DrawImage`, `DrawText`.
- Modificadores de estado: `PushTransform` (para transformar um bloco inteiro) e `PushClip` (para recortar). Lembre-se sempre de chamar o pop com o contexto após os pushes.

## Cache agressivo
Se a tela é complexa, evite recalcular emissões.
- Utilize `DrawingGroup` e marque elementos com `.Freeze()` para elementos estáticos.
- Configure `RenderOptions.CacheMode` (usando `BitmapCache`) para rasterizar as camadas de fundo.
- Segmente a renderização: não redesenhe camadas/objetos que não mudaram.

## 60 FPS
- Inscreva-se no evento `CompositionTarget.Rendering` para lidar com a animação de forma fluída sincronizada com a tela.
- Utilize estruturas como `DispatcherTimer` para *throttling* na renderização secundária.
- Evite *sempre* acionar `InvalidateVisual()` num loop sem verificação de necessidade real.

## Zoom e pan
- Utilize `MatrixTransform` para transformações rápidas de coordenadas em todo o contexto.
- **Zoom focalizado no mouse:** O centro do zoom deve usar as coordenadas do cursor (padrão Illustrator/Preps).
- **Pan:** O pan na tela deve ser acionado com o botão do meio ou segurando `Space`.

## DPI
Escalabilidade afeta fortemente a renderização pixel-perfect.
- Utilize `VisualTreeHelper.GetDpi(this)` para calcular o multiplicador de DPI real do monitor.
- Ative `UseLayoutRounding="True"`.
- Teste explicitamente o componente final a 100%, 125%, e 150% de zoom de tela do SO.

## SkiaSharp
Para casos onde a performance é vital além dos limites do WPF.
- Integre via `SKElement` ou `SKGLElement`.
- Utilize o wrapper `SKCanvasView` onde necessário.
- Oferece melhor performance e precisão cross-platform que o `DrawingContext` puro do WPF.

## Anti-patterns
- ❌ Executar `Canvas.Children.Add(...)` em loops intensos; prefira o `DrawingContext`.
- ❌ Preencher a `VisualTree` com milhares de instâncias de `FrameworkElement` interativos.
- ❌ Aplicar `Opacity` a um painel/grupo inteiro grande, o que compromete recursos de textura.
- ❌ Uso de propriedades velhas e limitadas como `BitmapEffect` (obsoleto e lento).
- ❌ Atualizar coleções observáveis (`ObservableCollection`) item por item em um loop, gerando inúmeros disparos visuais para nada.
