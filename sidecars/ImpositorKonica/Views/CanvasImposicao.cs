using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using ImpositorKonica.Models;
using QRCoder;

namespace ImpositorKonica.Views
{
    /// <summary>
    /// Canvas de imposição de altíssima performance.
    /// Renderiza primitivas vetoriais diretamente na GPU via DrawingContext.
    /// Coordenadas nativas: 1 unidade = 1 mm.
    /// </summary>
    public class CanvasImposicao : FrameworkElement
    {
        // Configurações físicas da chapa (mm)
        public double SheetWidthMm { get; set; } = 330.0;
        public double SheetHeightMm { get; set; } = 480.0;
        public double MarginMm { get; set; } = 5.0;
        public double GapMm { get; set; } = 3.0;
        public int ActiveRotation { get; set; } = 90; // 90 = 35x90mm (8x5 = 40), 0 = 90x35mm (3x12 = 36)

        // Itens montados na chapa
        private readonly List<PlacedLabel> _labels = new();
        public IReadOnlyList<PlacedLabel> PlacedLabels => _labels;

        // Cache de Geometrias de QR Code para performance 60 FPS
        private readonly Dictionary<string, Geometry> _qrCache = new();
        private readonly QRCodeGenerator _qrGenerator = new();

        // Matriz de visualização (Pan & Zoom focalizado)
        private Matrix _viewMatrix = Matrix.Identity;
        private bool _isPanning;
        private Point _lastMousePos;

        // Interação e Drag & Drop
        private PlacedLabel? _draggedLabel;
        private Point _dragStartWorldPos;
        private Point _labelOriginalPos;

        // Eventos
        public event EventHandler? SelectionChanged;
        public event EventHandler? SheetModified;

        // Recursos de desenho pré-alocados (evita alocações em tempo de render)
        private static readonly Pen SheetBorderPen = new(new SolidColorBrush(Color.FromRgb(160, 160, 160)), 0.6);
        private static readonly Pen MarginPen = new(new SolidColorBrush(Color.FromArgb(180, 230, 40, 40)), 0.4)
        {
            DashStyle = new DashStyle(new double[] { 4, 3 }, 0)
        };
        private static readonly Pen CutGuidePen = new(Brushes.Black, 0.3528); // 1 pt = 0.3528 mm exato
        private static readonly Pen SelectedCutPen = new(new SolidColorBrush(Color.FromRgb(245, 158, 11)), 0.8); // Destaque âmbar
        private static readonly Pen CropMarkPen = new(new SolidColorBrush(Color.FromRgb(80, 80, 80)), 0.088); // 0.25 pt
        private static readonly Brush LabelBackgroundBrush = Brushes.White;
        private static readonly Brush SheetBackgroundBrush = Brushes.White;
        private static readonly Brush CanvasBackgroundBrush = new SolidColorBrush(Color.FromRgb(24, 24, 27)); // Studio Dark (#18181b)
        private static readonly Brush TextBrush = Brushes.Black;
        private static readonly Brush SubTextBrush = new SolidColorBrush(Color.FromRgb(80, 80, 80));

        static CanvasImposicao()
        {
            ClipToBoundsProperty.OverrideMetadata(typeof(CanvasImposicao), new FrameworkPropertyMetadata(true));
        }

        public CanvasImposicao()
        {
            Focusable = true;
            ClipToBounds = true;

            Loaded += (s, e) => ZoomExtents();
            SizeChanged += (s, e) => { if (_viewMatrix.IsIdentity) ZoomExtents(); };

            // Mouse handlers
            MouseDown += OnMouseDownHandler;
            MouseMove += OnMouseMoveHandler;
            MouseUp += OnMouseUpHandler;
            MouseWheel += OnMouseWheelHandler;
        }

        #region Renderização GPU (OnRender)

        protected override void OnRender(DrawingContext dc)
        {
            base.OnRender(dc);

            // 1. Fundo neutro do Studio Dark
            dc.DrawRectangle(CanvasBackgroundBrush, null, new Rect(0, 0, ActualWidth, ActualHeight));

            // 2. Aplicar matriz de projeção milimétrica (1 un = 1 mm)
            dc.PushTransform(new MatrixTransform(_viewMatrix));

            // Sombra da chapa
            var shadowRect = new Rect(2, 2, SheetWidthMm, SheetHeightMm);
            dc.DrawRectangle(new SolidColorBrush(Color.FromArgb(90, 0, 0, 0)), null, shadowRect);

            // 3. Folha física branca (330 x 480 mm)
            var sheetRect = new Rect(0, 0, SheetWidthMm, SheetHeightMm);
            dc.DrawRectangle(SheetBackgroundBrush, SheetBorderPen, sheetRect);

            // 4. Margem de segurança de 5 mm da Konica (linha tracejada vermelha)
            var marginRect = new Rect(
                MarginMm,
                MarginMm,
                Math.Max(0, SheetWidthMm - 2 * MarginMm),
                Math.Max(0, SheetHeightMm - 2 * MarginMm)
            );
            dc.DrawRectangle(null, MarginPen, marginRect);

            // 5. Slug line industrial no topo externo
            DrawSlugLine(dc);

            // 6. Renderizar etiquetas posicionadas
            foreach (var label in _labels)
            {
                DrawLabel(dc, label);
            }

            dc.Pop(); // Restaura transformações
        }

        private void DrawSlugLine(DrawingContext dc)
        {
            var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            var text = $"FOLHA SRA3: {SheetWidthMm}x{SheetHeightMm}mm | ÁREA ÚTIL: {SheetWidthMm - 2 * MarginMm}x{SheetHeightMm - 2 * MarginMm}mm | GAP: {GapMm}mm | ETIQUETAS: {_labels.Count} UN";
            var ft = new FormattedText(
                text,
                CultureInfo.InvariantCulture,
                FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal),
                2.2, // ~6pt em mm
                new SolidColorBrush(Color.FromRgb(120, 120, 120)),
                dpi
            );
            dc.DrawText(ft, new Point(MarginMm, MarginMm - 3.2));
        }

        private void DrawLabel(DrawingContext dc, PlacedLabel label)
        {
            var bounds = label.GetBounds();
            var isVertical = label.Rotation == 90 || label.Width < label.Height;

            // Retângulo base com contorno de corte de 1pt (ou destaque âmbar se selecionado)
            var borderPen = label.IsSelected ? SelectedCutPen : CutGuidePen;
            dc.DrawRectangle(LabelBackgroundBrush, borderPen, bounds);

            // Fios de corte externos (Crop marks de 0.25pt = 0.088 mm)
            DrawCropMarks(dc, bounds);

            var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            var qrSizeMm = 24.0;

            if (!isVertical)
            {
                // Modo Horizontal (90 x 35 mm)
                // QR Code à esquerda
                var qrRect = new Rect(bounds.X + 4.0, bounds.Y + 5.5, qrSizeMm, qrSizeMm);
                DrawQrCode(dc, label.Item.QrPayload, qrRect);

                // Linha 1: Código Curto em destaque (#1042)
                var ftCode = new FormattedText(
                    label.Item.Code,
                    CultureInfo.InvariantCulture,
                    FlowDirection.LeftToRight,
                    new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
                    4.8, // ~14pt
                    TextBrush,
                    dpi
                );
                dc.DrawText(ftCode, new Point(bounds.X + 31.0, bounds.Y + 6.0));

                // Linha 2: Título do insumo
                var cleanTitle = Truncate(label.Item.Title, 24);
                var ftTitle = new FormattedText(
                    cleanTitle,
                    CultureInfo.InvariantCulture,
                    FlowDirection.LeftToRight,
                    new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
                    2.8, // ~8pt
                    TextBrush,
                    dpi
                );
                dc.DrawText(ftTitle, new Point(bounds.X + 31.0, bounds.Y + 12.5));

                // Linha 3: Subtítulo
                if (!string.IsNullOrWhiteSpace(label.Item.Subtitle))
                {
                    var ftSub = new FormattedText(
                        label.Item.Subtitle,
                        CultureInfo.InvariantCulture,
                        FlowDirection.LeftToRight,
                        new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal),
                        2.2, // ~6.5pt
                        SubTextBrush,
                        dpi
                    );
                    dc.DrawText(ftSub, new Point(bounds.X + 31.0, bounds.Y + 17.0));
                }

                // Linha 4: Detalhes / Lote
                if (!string.IsNullOrWhiteSpace(label.Item.Details))
                {
                    var ftDet = new FormattedText(
                        label.Item.Details,
                        CultureInfo.InvariantCulture,
                        FlowDirection.LeftToRight,
                        new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal),
                        2.0, // ~6pt
                        SubTextBrush,
                        dpi
                    );
                    dc.DrawText(ftDet, new Point(bounds.X + 31.0, bounds.Y + 21.0));
                }
            }
            else
            {
                // Modo Vertical (35 x 90 mm)
                // QR Code centralizado na parte superior
                var qrX = bounds.X + (bounds.Width - qrSizeMm) / 2.0;
                var qrRect = new Rect(qrX, bounds.Y + 4.5, qrSizeMm, qrSizeMm);
                DrawQrCode(dc, label.Item.QrPayload, qrRect);

                // Linha 1: Código Curto (#1042)
                var ftCode = new FormattedText(
                    label.Item.Code,
                    CultureInfo.InvariantCulture,
                    FlowDirection.LeftToRight,
                    new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
                    4.6,
                    TextBrush,
                    dpi
                );
                dc.DrawText(ftCode, new Point(bounds.X + 3.0, bounds.Y + 31.0));

                // Linha 2: Título
                var cleanTitle = Truncate(label.Item.Title, 18);
                var ftTitle = new FormattedText(
                    cleanTitle,
                    CultureInfo.InvariantCulture,
                    FlowDirection.LeftToRight,
                    new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
                    2.6,
                    TextBrush,
                    dpi
                );
                dc.DrawText(ftTitle, new Point(bounds.X + 3.0, bounds.Y + 37.5));

                // Linha 3: Subtítulo
                if (!string.IsNullOrWhiteSpace(label.Item.Subtitle))
                {
                    var ftSub = new FormattedText(
                        label.Item.Subtitle,
                        CultureInfo.InvariantCulture,
                        FlowDirection.LeftToRight,
                        new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal),
                        2.1,
                        SubTextBrush,
                        dpi
                    );
                    dc.DrawText(ftSub, new Point(bounds.X + 3.0, bounds.Y + 42.0));
                }

                // Linha 4: Detalhes
                if (!string.IsNullOrWhiteSpace(label.Item.Details))
                {
                    var ftDet = new FormattedText(
                        label.Item.Details,
                        CultureInfo.InvariantCulture,
                        FlowDirection.LeftToRight,
                        new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal),
                        1.9,
                        SubTextBrush,
                        dpi
                    );
                    dc.DrawText(ftDet, new Point(bounds.X + 3.0, bounds.Y + 46.0));
                }
            }
        }

        private void DrawCropMarks(DrawingContext dc, Rect b)
        {
            double arm = 2.0; // 2mm de braço de corte
            // Cantos
            dc.DrawLine(CropMarkPen, new Point(b.Left - arm, b.Top), new Point(b.Left, b.Top));
            dc.DrawLine(CropMarkPen, new Point(b.Left, b.Top - arm), new Point(b.Left, b.Top));

            dc.DrawLine(CropMarkPen, new Point(b.Right + arm, b.Top), new Point(b.Right, b.Top));
            dc.DrawLine(CropMarkPen, new Point(b.Right, b.Top - arm), new Point(b.Right, b.Top));

            dc.DrawLine(CropMarkPen, new Point(b.Left - arm, b.Bottom), new Point(b.Left, b.Bottom));
            dc.DrawLine(CropMarkPen, new Point(b.Left, b.Bottom + arm), new Point(b.Left, b.Bottom));

            dc.DrawLine(CropMarkPen, new Point(b.Right + arm, b.Bottom), new Point(b.Right, b.Bottom));
            dc.DrawLine(CropMarkPen, new Point(b.Right, b.Bottom + arm), new Point(b.Right, b.Bottom));
        }

        private void DrawQrCode(DrawingContext dc, string payload, Rect targetRect)
        {
            if (string.IsNullOrEmpty(payload)) return;

            if (!_qrCache.TryGetValue(payload, out var geometry))
            {
                geometry = GenerateQrGeometry(payload);
                _qrCache[payload] = geometry;
            }

            // Normalizar escala para caber exatamente em targetRect
            dc.PushTransform(new TranslateTransform(targetRect.X, targetRect.Y));
            double scale = targetRect.Width / 100.0;
            dc.PushTransform(new ScaleTransform(scale, scale));
            dc.DrawGeometry(Brushes.Black, null, geometry);
            dc.Pop();
            dc.Pop();
        }

        private Geometry GenerateQrGeometry(string payload)
        {
            var qrCodeData = _qrGenerator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M);
            var matrix = qrCodeData.ModuleMatrix;
            int count = matrix.Count;
            double modSize = 100.0 / count;

            var streamGeom = new StreamGeometry();
            using (var ctx = streamGeom.Open())
            {
                for (int r = 0; r < count; r++)
                {
                    var row = matrix[r];
                    for (int c = 0; c < count; c++)
                    {
                        if (row[c])
                        {
                            double x = c * modSize;
                            double y = r * modSize;
                            ctx.BeginFigure(new Point(x, y), true, true);
                            ctx.LineTo(new Point(x + modSize, y), false, false);
                            ctx.LineTo(new Point(x + modSize, y + modSize), false, false);
                            ctx.LineTo(new Point(x, y + modSize), false, false);
                        }
                    }
                }
            }
            streamGeom.Freeze();
            return streamGeom;
        }

        private static string Truncate(string val, int max)
        {
            if (string.IsNullOrEmpty(val)) return string.Empty;
            return val.Length <= max ? val : val.Substring(0, max - 1) + "…";
        }

        #endregion

        #region Pan e Zoom Focalizado

        private void OnMouseWheelHandler(object sender, MouseWheelEventArgs e)
        {
            Point mousePos = e.GetPosition(this);
            double factor = e.Delta > 0 ? 1.15 : (1.0 / 1.15);

            double currentScale = _viewMatrix.M11;
            if (currentScale * factor < 0.2 || currentScale * factor > 25.0) return;

            // Escalonamento focalizado no cursor
            _viewMatrix.ScaleAt(factor, factor, mousePos.X, mousePos.Y);
            InvalidateVisual();
            e.Handled = true;
        }

        public void ZoomExtents()
        {
            if (ActualWidth <= 0 || ActualHeight <= 0) return;

            double pad = 25.0;
            double availW = ActualWidth - pad * 2;
            double availH = ActualHeight - pad * 2;

            double scaleX = availW / SheetWidthMm;
            double scaleY = availH / SheetHeightMm;
            double fitScale = Math.Min(scaleX, scaleY);

            double offsetX = (ActualWidth - SheetWidthMm * fitScale) / 2.0;
            double offsetY = (ActualHeight - SheetHeightMm * fitScale) / 2.0;

            _viewMatrix = new Matrix(fitScale, 0, 0, fitScale, offsetX, offsetY);
            InvalidateVisual();
        }

        public void ZoomIn()
        {
            Point center = new(ActualWidth / 2.0, ActualHeight / 2.0);
            _viewMatrix.ScaleAt(1.2, 1.2, center.X, center.Y);
            InvalidateVisual();
        }

        public void ZoomOut()
        {
            Point center = new(ActualWidth / 2.0, ActualHeight / 2.0);
            _viewMatrix.ScaleAt(1.0 / 1.2, 1.0 / 1.2, center.X, center.Y);
            InvalidateVisual();
        }

        public void ResetZoom100()
        {
            // 1 mm = ~3.78 pixels em tela 96 DPI
            double dpiFactor = VisualTreeHelper.GetDpi(this).PixelsPerInch / 25.4;
            Point center = new(ActualWidth / 2.0, ActualHeight / 2.0);
            double currentScale = _viewMatrix.M11;
            double factor = dpiFactor / currentScale;
            _viewMatrix.ScaleAt(factor, factor, center.X, center.Y);
            InvalidateVisual();
        }

        #endregion

        #region Eventos do Mouse e Drag & Drop

        private void OnMouseDownHandler(object sender, MouseButtonEventArgs e)
        {
            Focus();
            Point screenPos = e.GetPosition(this);
            Point worldPos = ScreenToWorld(screenPos);

            if (e.ChangedButton == MouseButton.Right || Keyboard.IsKeyDown(Key.Space) || e.MiddleButton == MouseButtonState.Pressed)
            {
                // Iniciar Pan
                _isPanning = true;
                _lastMousePos = screenPos;
                CaptureMouse();
                Cursor = Cursors.SizeAll;
                e.Handled = true;
                return;
            }

            if (e.ChangedButton == MouseButton.Left)
            {
                // Hit-testing em espaço métrico
                var hit = _labels.LastOrDefault(l => l.GetBounds().Contains(worldPos));

                if (!Keyboard.IsKeyDown(Key.LeftCtrl) && !Keyboard.IsKeyDown(Key.RightCtrl))
                {
                    foreach (var l in _labels) l.IsSelected = false;
                }

                if (hit != null)
                {
                    hit.IsSelected = true;
                    _draggedLabel = hit;
                    _dragStartWorldPos = worldPos;
                    _labelOriginalPos = new Point(hit.X, hit.Y);
                    CaptureMouse();
                }

                SelectionChanged?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
                e.Handled = true;
            }
        }

        private void OnMouseMoveHandler(object sender, MouseEventArgs e)
        {
            Point screenPos = e.GetPosition(this);

            if (_isPanning)
            {
                Vector delta = screenPos - _lastMousePos;
                _viewMatrix.Translate(delta.X, delta.Y);
                _lastMousePos = screenPos;
                InvalidateVisual();
                e.Handled = true;
                return;
            }

            if (_draggedLabel != null)
            {
                Point currentWorldPos = ScreenToWorld(screenPos);
                Vector worldDelta = currentWorldPos - _dragStartWorldPos;

                _draggedLabel.X = _labelOriginalPos.X + worldDelta.X;
                _draggedLabel.Y = _labelOriginalPos.Y + worldDelta.Y;

                // Snapping simples às bordas da margem
                if (Math.Abs(_draggedLabel.X - MarginMm) < 1.5) _draggedLabel.X = MarginMm;
                if (Math.Abs(_draggedLabel.Y - MarginMm) < 1.5) _draggedLabel.Y = MarginMm;

                InvalidateVisual();
                e.Handled = true;
            }
        }

        private void OnMouseUpHandler(object sender, MouseButtonEventArgs e)
        {
            if (_isPanning)
            {
                _isPanning = false;
                ReleaseMouseCapture();
                Cursor = Cursors.Arrow;
                e.Handled = true;
                return;
            }

            if (_draggedLabel != null)
            {
                _draggedLabel = null;
                ReleaseMouseCapture();
                SheetModified?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
                e.Handled = true;
            }
        }

        public Point ScreenToWorld(Point screen)
        {
            var inv = _viewMatrix;
            if (inv.HasInverse)
            {
                inv.Invert();
                return inv.Transform(screen);
            }
            return screen;
        }

        #endregion

        #region Comandos de Imposição (AutoGang, Alinhamentos e Atalhos)

        public void LoadPayload(ImpositionPayload payload)
        {
            SheetWidthMm = payload.SheetWidthMm > 0 ? payload.SheetWidthMm : 330.0;
            SheetHeightMm = payload.SheetHeightMm > 0 ? payload.SheetHeightMm : 480.0;
            MarginMm = payload.MarginMm >= 0 ? payload.MarginMm : 5.0;
            GapMm = payload.GapMm >= 0 ? payload.GapMm : 3.0;
            ActiveRotation = payload.DefaultRotation;

            _labels.Clear();

            // AutoGang inicial se houver insumos
            if (payload.Items.Count > 0)
            {
                ExecuteAutoGang(payload.Items);
            }

            ZoomExtents();
        }

        public void ToggleOrientation()
        {
            ActiveRotation = ActiveRotation == 90 ? 0 : 90;
            var currentItems = _labels.Select(l => l.Item).ToList();
            _labels.Clear();
            if (currentItems.Count > 0)
            {
                ExecuteAutoGang(currentItems);
            }
            InvalidateVisual();
            SheetModified?.Invoke(this, EventArgs.Empty);
        }

        public void ExecuteAutoGang(IEnumerable<ImpositionItemDto> items)
        {
            _labels.Clear();
            var itemList = items.ToList();
            if (itemList.Count == 0) return;

            bool isVertical = ActiveRotation == 90;
            int cols = isVertical ? 8 : 3;
            int rows = isVertical ? 5 : 12;
            double labelW = isVertical ? 35.0 : 90.0;
            double labelH = isVertical ? 90.0 : 35.0;

            int capacity = cols * rows;
            int itemIndex = 0;

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    if (_labels.Count >= capacity) break;

                    var item = itemList[itemIndex % itemList.Count];
                    double x = MarginMm + c * (labelW + GapMm);
                    double y = MarginMm + r * (labelH + GapMm);

                    var label = new PlacedLabel(item, x, y, labelW, labelH, ActiveRotation);
                    _labels.Add(label);
                    itemIndex++;
                }
            }

            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AddLabel(ImpositionItemDto item)
        {
            bool isVertical = ActiveRotation == 90;
            double labelW = isVertical ? 35.0 : 90.0;
            double labelH = isVertical ? 90.0 : 35.0;

            // Achar próxima posição livre
            double x = MarginMm;
            double y = MarginMm;
            if (_labels.Count > 0)
            {
                var last = _labels.Last();
                x = last.X + last.Width + GapMm;
                y = last.Y;
                if (x + labelW > SheetWidthMm - MarginMm)
                {
                    x = MarginMm;
                    y = last.Y + last.Height + GapMm;
                }
            }

            var label = new PlacedLabel(item, x, y, labelW, labelH, ActiveRotation) { IsSelected = true };
            foreach (var l in _labels) l.IsSelected = false;
            _labels.Add(label);

            SheetModified?.Invoke(this, EventArgs.Empty);
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void DuplicateSelected()
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;

            foreach (var s in selected)
            {
                double nextX = s.X + s.Width + GapMm;
                double nextY = s.Y;
                if (nextX + s.Width > SheetWidthMm - MarginMm)
                {
                    nextX = MarginMm;
                    nextY = s.Y + s.Height + GapMm;
                }

                var clone = new PlacedLabel(s.Item, nextX, nextY, s.Width, s.Height, s.Rotation);
                _labels.Add(clone);
            }

            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void DeleteSelected()
        {
            _labels.RemoveAll(l => l.IsSelected);
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void ClearSheet()
        {
            _labels.Clear();
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        // Atalhos Gráficos (P, C, E, T, B, L, R)
        public void CenterSelectedOnSheet() // Tecla P
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;

            double minX = selected.Min(l => l.X);
            double maxX = selected.Max(l => l.X + l.Width);
            double minY = selected.Min(l => l.Y);
            double maxY = selected.Max(l => l.Y + l.Height);

            double groupW = maxX - minX;
            double groupH = maxY - minY;

            double targetX = (SheetWidthMm - groupW) / 2.0;
            double targetY = (SheetHeightMm - groupH) / 2.0;

            double dx = targetX - minX;
            double dy = targetY - minY;

            foreach (var l in selected)
            {
                l.X += dx;
                l.Y += dy;
            }

            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedCentersHorizontal() // Tecla C
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count < 2) return;
            double centerX = selected.First().X + selected.First().Width / 2.0;
            foreach (var l in selected.Skip(1)) l.X = centerX - l.Width / 2.0;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedCentersVertical() // Tecla E
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count < 2) return;
            double centerY = selected.First().Y + selected.First().Height / 2.0;
            foreach (var l in selected.Skip(1)) l.Y = centerY - l.Height / 2.0;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedTop() // Tecla T
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.Y = MarginMm;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedBottom() // Tecla B
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.Y = SheetHeightMm - MarginMm - l.Height;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedLeft() // Tecla L
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.X = MarginMm;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedRight() // Tecla R
        {
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.X = SheetWidthMm - MarginMm - l.Width;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        #endregion
    }
}
