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
        public string SheetName { get; set; } = "FOLHA SRA3";
        public double SheetWidthMm { get; set; } = 330.0;
        public double SheetHeightMm { get; set; } = 480.0;
        public double MarginMm { get; set; } = 5.0;
        public double GapMm { get; set; } = 3.0;
        public int ActiveRotation { get; set; } = 90; // 90 = etiquetas verticais 35x90, 0 = horizontais 90x35

        // Itens montados na chapa
        private readonly List<PlacedLabel> _labels = new();
        public IReadOnlyList<PlacedLabel> PlacedLabels => _labels;
        public IReadOnlyList<PlacedLabel> SelectedItems => _labels.Where(l => l.IsSelected).ToList();

        // Cache de Geometrias de QR Code para performance 60 FPS
        private readonly Dictionary<string, Geometry> _qrCache = new();
        private readonly QRCodeGenerator _qrGenerator = new();

        // Matriz de visualização (Pan & Zoom focalizado)
        private Matrix _viewMatrix = Matrix.Identity;
        private bool _isPanning;
        private Point _lastMousePos;

        // Interação e Drag & Drop
        private PlacedLabel? _draggedLabel;
        private readonly Dictionary<PlacedLabel, Point> _dragOrigins = new();
        private Point _dragStartWorldPos;
        private Point _labelOriginalPos;
        private bool _snapshotPendingForDrag;

        // Seleção elástica (Marquee)
        private bool _isMarquee;
        private bool _marqueeAdditive;
        private Point _marqueeStartScreen;
        private Point _marqueeCurrentScreen;

        // Estado de pré-impressão
        private bool _showCropMarks = true;
        public bool ShowCropMarks
        {
            get => _showCropMarks;
            set
            {
                if (_showCropMarks == value) return;
                _showCropMarks = value;
                InvalidateVisual();
            }
        }

        // Histórico (Undo/Redo)
        private readonly Stack<List<PlacedLabel>> _undoStack = new();
        private readonly Stack<List<PlacedLabel>> _redoStack = new();
        private bool _isRestoringSnapshot = false;

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

        // Marquee (seleção elástica estilo Illustrator)
        private static readonly Brush MarqueeFillBrush = new SolidColorBrush(Color.FromArgb(0x22, 0x00, 0x7A, 0xCC));
        private static readonly Pen MarqueePen = new(new SolidColorBrush(Color.FromRgb(0x00, 0x7A, 0xCC)), 1)
        {
            DashStyle = new DashStyle(new double[] { 3, 2 }, 0)
        };

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

            // 3–6. Folha física, margem de segurança, slug e etiquetas
            DrawSheet(dc);

            dc.Pop(); // Restaura transformações

            // 7. Overlay da seleção elástica (em espaço de tela)
            if (_isMarquee)
            {
                var marqueeRect = new Rect(
                    Math.Min(_marqueeStartScreen.X, _marqueeCurrentScreen.X),
                    Math.Min(_marqueeStartScreen.Y, _marqueeCurrentScreen.Y),
                    Math.Abs(_marqueeCurrentScreen.X - _marqueeStartScreen.X),
                    Math.Abs(_marqueeCurrentScreen.Y - _marqueeStartScreen.Y)
                );
                dc.DrawRectangle(MarqueeFillBrush, MarqueePen, marqueeRect);
            }
        }

        private void DrawSheet(DrawingContext dc)
        {
            // Folha física branca (330 x 480 mm)
            var sheetRect = new Rect(0, 0, SheetWidthMm, SheetHeightMm);
            dc.DrawRectangle(SheetBackgroundBrush, SheetBorderPen, sheetRect);

            // Margem de segurança de 5 mm da Konica (linha tracejada vermelha)
            var marginRect = new Rect(
                MarginMm,
                MarginMm,
                Math.Max(0, SheetWidthMm - 2 * MarginMm),
                Math.Max(0, SheetHeightMm - 2 * MarginMm)
            );
            dc.DrawRectangle(null, MarginPen, marginRect);

            // Slug line industrial no topo externo
            DrawSlugLine(dc);

            // Renderizar etiquetas posicionadas
            foreach (var label in _labels)
            {
                DrawLabel(dc, label);
            }
        }

        private void DrawSlugLine(DrawingContext dc)
        {
            var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            var text = $"{SheetName}: {SheetWidthMm}x{SheetHeightMm}mm | ÁREA ÚTIL: {SheetWidthMm - 2 * MarginMm}x{SheetHeightMm - 2 * MarginMm}mm | GAP: {GapMm}mm | ETIQUETAS: {_labels.Count} UN";
            var ft = new FormattedText(
                text,
                CultureInfo.InvariantCulture,
                FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal),
                2.8, // ~10px em mm
                new SolidColorBrush(Color.FromRgb(136, 136, 136)), // #888888
                dpi
            );
            dc.DrawText(ft, new Point(MarginMm, -8.0));
        }

        private void DrawLabel(DrawingContext dc, PlacedLabel label)
        {
            var slotRect = label.GetBounds();
            var isVertical = label.Rotation == 90 || slotRect.Width < slotRect.Height;

            if (isVertical)
            {
                // Calcule o centro do slot:
                double cx = slotRect.X + (slotRect.Width / 2.0);
                double cy = slotRect.Y + (slotRect.Height / 2.0);
                
                // Empilhe a transformação de rotação no DrawingContext:
                dc.PushTransform(new RotateTransform(90, cx, cy));
                
                // Desenhe a etiqueta nativa de 90x35 centralizada nesse mesmo ponto:
                Rect rectCentralizado = new Rect(cx - 45.0, cy - 17.5, 90.0, 35.0);
                DrawNativeLabel(dc, label, rectCentralizado);
                
                // Remova a transformação imediatamente:
                dc.Pop();
            }
            else
            {
                // Desenhe a etiqueta diretamente nas coordenadas X, Y do slot.
                DrawNativeLabel(dc, label, slotRect);
            }
        }

        private void DrawNativeLabel(DrawingContext dc, PlacedLabel label, Rect r)
        {
            // Contorno: preto 1pt de corte, âmbar se selecionado, ou ausente quando as marcas estão ocultas
            Pen? borderPen = label.IsSelected ? SelectedCutPen : CutGuidePen;
            if (!ShowCropMarks && !label.IsSelected) borderPen = null;

            dc.DrawRectangle(LabelBackgroundBrush, borderPen, r);

            // Fios de corte externos (0.25 pt) — omitidos quando o toggle de marcas está desativado
            if (ShowCropMarks) DrawCropMarks(dc, label, r);

            DrawLabelContent(dc, label, r);
        }

        private void DrawLabelContent(DrawingContext dc, PlacedLabel label, Rect r)
        {
            if (_pieceThumbnail is not null)
            {
                dc.DrawImage(_pieceThumbnail, r);
                return;
            }

            // QR Code à esquerda, centralizado no eixo Y
            var qrRect = new Rect(
                r.X + LabelLayout.QrOffsetX,
                r.Y + LabelLayout.QrOffsetY,
                LabelLayout.QrSize,
                LabelLayout.QrSize
            );
            DrawQrCode(dc, label.Item.QrPayload, qrRect);

            double textX = r.X + LabelLayout.TextStartX;

            // Linha 1: Código em destaque (11pt)
            var ftCode = MakeText(label.Item.Code, FontWeights.Bold, LabelLayout.CodeFontSize, TextBrush);
            dc.DrawText(ftCode, new Point(textX, r.Y + LabelLayout.CodeY));

            // Linha 2: Descrição do material (8pt)
            var ftTitle = MakeText(LabelLayout.Truncate(label.Item.Title, LabelLayout.TitleMaxChars), FontWeights.Bold, LabelLayout.TitleFontSize, TextBrush);
            dc.DrawText(ftTitle, new Point(textX, r.Y + LabelLayout.TitleY));

            // Linha 3: Subtítulo (7pt)
            double metaY = LabelLayout.SubtitleY;
            if (!string.IsNullOrWhiteSpace(label.Item.Subtitle))
            {
                var ftSub = MakeText(label.Item.Subtitle, FontWeights.Normal, LabelLayout.MetaFontSize, SubTextBrush);
                dc.DrawText(ftSub, new Point(textX, r.Y + metaY));
                metaY += LabelLayout.MetaLineStep;
            }

            // Linha 4: Metragem / Lote (7pt)
            if (!string.IsNullOrWhiteSpace(label.Item.Details))
            {
                var ftDet = MakeText(label.Item.Details, FontWeights.Normal, LabelLayout.MetaFontSize, SubTextBrush);
                dc.DrawText(ftDet, new Point(textX, r.Y + metaY));
            }
        }

        private FormattedText MakeText(string? text, FontWeight weight, double sizeMm, Brush brush)
        {
            var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            return new FormattedText(
                text ?? string.Empty,
                CultureInfo.InvariantCulture,
                FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI, Arial"), FontStyles.Normal, weight, FontStretches.Normal),
                sizeMm,
                brush,
                dpi
            );
        }

        private void DrawCropMarks(DrawingContext dc, PlacedLabel label, Rect r)
        {
            foreach (var cm in label.CropMarks)
            {
                if (cm.IsDeleted) continue;
                Pen pen = cm.IsSelected ? SelectedCutPen : CropMarkPen;
                dc.DrawLine(pen, 
                    new Point(cm.StartPointMm.X + r.X, cm.StartPointMm.Y + r.Y), 
                    new Point(cm.EndPointMm.X + r.X, cm.EndPointMm.Y + r.Y));
            }
        }

        private void DrawQrCode(DrawingContext dc, string payload, Rect targetRect)
        {
            var geometry = GetQrGeometry(payload);
            if (geometry == null) return;

            // Normalizar escala para caber exatamente em targetRect
            dc.PushTransform(new TranslateTransform(targetRect.X, targetRect.Y));
            double scale = targetRect.Width / 100.0;
            dc.PushTransform(new ScaleTransform(scale, scale));
            dc.DrawGeometry(Brushes.Black, null, geometry);
            dc.Pop();
            dc.Pop();
        }

        public Geometry? GetQrGeometry(string payload)
        {
            if (string.IsNullOrEmpty(payload)) return null;

            if (!_qrCache.TryGetValue(payload, out var geometry))
            {
                geometry = GenerateQrGeometry(payload);
                _qrCache[payload] = geometry;
            }
            return geometry;
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
            double dpiFactor = VisualTreeHelper.GetDpi(this).PixelsPerInchX / 25.4;
            Point center = new(ActualWidth / 2.0, ActualHeight / 2.0);
            double currentScale = _viewMatrix.M11;
            double factor = dpiFactor / currentScale;
            _viewMatrix.ScaleAt(factor, factor, center.X, center.Y);
            InvalidateVisual();
        }

        #endregion

        #region Eventos do Mouse, Drag & Drop e Marquee

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
                bool additive = (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) != 0;

                // 1. Hit-testing Crop Marks
                if (ShowCropMarks)
                {
                    foreach (var l in _labels)
                    {
                        var bounds = l.GetBounds();
                        bool isVertical = l.Rotation == 90 || bounds.Width < bounds.Height;
                        Point localPos = worldPos;
                        
                        Rect r = bounds;
                        if (isVertical)
                        {
                            double centerX = bounds.X + bounds.Width / 2.0;
                            double centerY = bounds.Y + bounds.Height / 2.0;
                            Matrix m = Matrix.Identity;
                            m.RotateAt(-90, centerX, centerY);
                            localPos = m.Transform(worldPos);
                            r = new Rect(centerX - LabelLayout.NativeWidth / 2.0, centerY - LabelLayout.NativeHeight / 2.0, LabelLayout.NativeWidth, LabelLayout.NativeHeight);
                        }

                        foreach (var cm in l.CropMarks)
                        {
                            if (cm.IsDeleted) continue;
                            Point p1 = new Point(cm.StartPointMm.X + r.X, cm.StartPointMm.Y + r.Y);
                            Point p2 = new Point(cm.EndPointMm.X + r.X, cm.EndPointMm.Y + r.Y);
                            
                            double l2 = (p1.X - p2.X)*(p1.X - p2.X) + (p1.Y - p2.Y)*(p1.Y - p2.Y);
                            double d = 0;
                            if (l2 == 0) 
                            {
                                d = Point.Subtract(localPos, p1).Length;
                            }
                            else
                            {
                                double t = Math.Max(0, Math.Min(1, Vector.Multiply(localPos - p1, p2 - p1) / l2));
                                Point projection = p1 + t * (p2 - p1);
                                d = Point.Subtract(localPos, projection).Length;
                            }

                            if (d < 1.5) // 1.5mm hit radius
                            {
                                if (!additive)
                                {
                                    foreach (var lbl in _labels)
                                    {
                                        lbl.IsSelected = false;
                                        foreach (var m in lbl.CropMarks) m.IsSelected = false;
                                    }
                                }
                                cm.IsSelected = !cm.IsSelected;
                                SelectionChanged?.Invoke(this, EventArgs.Empty);
                                InvalidateVisual();
                                e.Handled = true;
                                return;
                            }
                        }
                    }
                }

                // Hit-testing em espaço métrico
                var hit = _labels.LastOrDefault(l => l.GetBounds().Contains(worldPos));

                if (hit != null)
                {
                    // Clicou na etiqueta → seleciona o grupo inteiro (se pertencer a um) ou a própria etiqueta
                    var clickSet = hit.GroupId != null
                        ? _labels.Where(l => l.GroupId == hit.GroupId).ToList()
                        : new List<PlacedLabel> { hit };

                    if (!additive)
                    {
                        foreach (var l in _labels) l.IsSelected = false;
                    }
                    foreach (var l in clickSet) l.IsSelected = true;

                    // Conjunto de arraste: grupo completo ou toda a seleção atual
                    var dragSet = hit.GroupId != null
                        ? _labels.Where(l => l.GroupId == hit.GroupId).ToList()
                        : _labels.Where(l => l.IsSelected).ToList();
                    if (dragSet.Count == 0) dragSet.Add(hit);

                    _draggedLabel = hit;
                    _dragStartWorldPos = worldPos;
                    _labelOriginalPos = new Point(hit.X, hit.Y);
                    _dragOrigins.Clear();
                    foreach (var l in dragSet) _dragOrigins[l] = new Point(l.X, l.Y);

                    _snapshotPendingForDrag = true;

                    CaptureMouse();
                    SelectionChanged?.Invoke(this, EventArgs.Empty);
                    InvalidateVisual();
                    e.Handled = true;
                    return;
                }

                // Área vazia → inicio da seleção elástica (Marquee)
                if (!additive)
                {
                    foreach (var l in _labels) l.IsSelected = false;
                    SelectionChanged?.Invoke(this, EventArgs.Empty);
                }

                _marqueeAdditive = additive;
                _isMarquee = true;
                _marqueeStartScreen = screenPos;
                _marqueeCurrentScreen = screenPos;
                CaptureMouse();
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

            if (_isMarquee)
            {
                _marqueeCurrentScreen = screenPos;
                InvalidateVisual();
                e.Handled = true;
                return;
            }

            if (_draggedLabel != null)
            {
                if (_snapshotPendingForDrag)
                {
                    SaveSnapshot();
                    _snapshotPendingForDrag = false;
                }

                Point currentWorldPos = ScreenToWorld(screenPos);
                Vector worldDelta = currentWorldPos - _dragStartWorldPos;

                // Move todos os membros do conjunto (grupo ou múltipla seleção) mantendo distâncias relativas
                foreach (var pair in _dragOrigins)
                {
                    pair.Key.X = pair.Value.X + worldDelta.X;
                    pair.Key.Y = pair.Value.Y + worldDelta.Y;
                }

                // Snapping simples às bordas da margem (aplica-se apenas à etiqueta arrastada)
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

            if (_isMarquee)
            {
                _isMarquee = false;
                ReleaseMouseCapture();
                CommitMarqueeSelection();
                e.Handled = true;
                return;
            }

            if (_draggedLabel != null)
            {
                _draggedLabel = null;
                _dragOrigins.Clear();
                ReleaseMouseCapture();
                SheetModified?.Invoke(this, EventArgs.Empty);
                InvalidateVisual();
                e.Handled = true;
            }
        }

        private void CommitMarqueeSelection()
        {
            Point startWorld = ScreenToWorld(_marqueeStartScreen);
            Point currentWorld = ScreenToWorld(_marqueeCurrentScreen);

            var worldRect = new Rect(
                Math.Min(startWorld.X, currentWorld.X),
                Math.Min(startWorld.Y, currentWorld.Y),
                Math.Abs(currentWorld.X - startWorld.X),
                Math.Abs(currentWorld.Y - startWorld.Y)
            );

            if (!_marqueeAdditive)
            {
                foreach (var l in _labels) l.IsSelected = false;
            }

            // Interseção geométrica com as etiquetas da folha
            foreach (var l in _labels)
            {
                if (worldRect.IntersectsWith(l.GetBounds()))
                {
                    l.IsSelected = true;
                }
            }

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
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

        #region Seleção, Agrupamento e Comandos de Imposição

        public Rect? GetSelectionBounds()
        {
            var sel = _labels.Where(l => l.IsSelected).ToList();
            if (sel.Count == 0) return null;

            double minX = sel.Min(l => l.X);
            double minY = sel.Min(l => l.Y);
            double maxX = sel.Max(l => l.X + l.Width);
            double maxY = sel.Max(l => l.Y + l.Height);

            return new Rect(minX, minY, maxX - minX, maxY - minY);
        }

        public void GroupSelected()
        {
            SaveSnapshot(); 
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;

            var groupId = Guid.NewGuid();
            foreach (var l in selected) l.GroupId = groupId;

            SheetModified?.Invoke(this, EventArgs.Empty);
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void UngroupSelected()
        {
            SaveSnapshot(); 
            var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;

            foreach (var l in selected) l.GroupId = null;

            SheetModified?.Invoke(this, EventArgs.Empty);
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void LoadPayload(ImpositionPayload payload)
        {
            SheetName = string.IsNullOrEmpty(payload.SheetName) ? "FOLHA SRA3" : payload.SheetName;
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
            SaveSnapshot();
            _labels.Clear();
            _dragOrigins.Clear();
            var itemList = items.ToList();
            if (itemList.Count == 0) return;

            bool isVertical = ActiveRotation == 90;
            double labelW = isVertical ? 35.0 : 90.0;
            double labelH = isVertical ? 90.0 : 35.0;

            // Grade calculada pela folha real (cabe apenas o que couber na chapa)
            double usableW = Math.Max(0, SheetWidthMm - 2 * MarginMm);
            double usableH = Math.Max(0, SheetHeightMm - 2 * MarginMm);
            int cols = (int)Math.Floor((usableW + GapMm) / (labelW + GapMm));
            int rows = (int)Math.Floor((usableH + GapMm) / (labelH + GapMm));
            if (cols < 1) cols = 1;
            if (rows < 1) rows = 1;

            int capacity = cols * rows;
            int itemIndex = 0;

            double totalGridW = cols * labelW + (cols - 1) * GapMm;
            double totalGridH = rows * labelH + (rows - 1) * GapMm;
            
            double offsetX = MarginMm + (usableW - totalGridW) / 2.0;
            double offsetY = MarginMm + (usableH - totalGridH) / 2.0;

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    if (_labels.Count >= capacity) break;

                    var item = itemList[itemIndex % itemList.Count];
                    double x = offsetX + c * (labelW + GapMm);
                    double y = offsetY + r * (labelH + GapMm);

                    var label = new PlacedLabel(item, x, y, labelW, labelH, ActiveRotation);
                    _labels.Add(label);
                    itemIndex++;
                }
            }

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AddLabel(ImpositionItemDto item)
        {
            SaveSnapshot();
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
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
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
            SaveSnapshot();
            bool deletedCropMarks = false;
            foreach (var l in _labels)
            {
                foreach (var cm in l.CropMarks)
                {
                    if (cm.IsSelected && !cm.IsDeleted)
                    {
                        cm.IsDeleted = true;
                        cm.IsSelected = false;
                        deletedCropMarks = true;
                    }
                }
            }

            if (!deletedCropMarks)
            {
                _labels.RemoveAll(l => l.IsSelected);
                _dragOrigins.Clear();
            }

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        
        private System.Windows.Media.Imaging.BitmapSource? _pieceThumbnail;

        public void LoadPreviewLabels(IEnumerable<PlacedLabel> labels, System.Windows.Media.Imaging.BitmapSource? thumbnail = null)
        {
            _pieceThumbnail = thumbnail;
            _labels.Clear();
            _labels.AddRange(labels);
            InvalidateVisual();
        }
        public void ClearSheet()
        {
            SaveSnapshot();
            _labels.Clear();
            _dragOrigins.Clear();
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        // Atalhos Gráficos (P, C, E, T, B, L, R)
        public void CenterSelectedOnSheet() // Tecla P
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
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
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count < 2) return;
            double centerX = selected.First().X + selected.First().Width / 2.0;
            foreach (var l in selected.Skip(1)) l.X = centerX - l.Width / 2.0;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedCentersVertical() // Tecla E
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count < 2) return;
            double centerY = selected.First().Y + selected.First().Height / 2.0;
            foreach (var l in selected.Skip(1)) l.Y = centerY - l.Height / 2.0;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedTop() // Tecla T
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.Y = MarginMm;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedBottom() // Tecla B
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.Y = SheetHeightMm - MarginMm - l.Height;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedLeft() // Tecla L
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.X = MarginMm;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void AlignSelectedRight() // Tecla R
        {
            SaveSnapshot(); var selected = _labels.Where(l => l.IsSelected).ToList();
            if (selected.Count == 0) return;
            foreach (var l in selected) l.X = SheetWidthMm - MarginMm - l.Width;
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        #endregion
        
        #region Undo / Redo

        public void SaveSnapshot()
        {
            if (_isRestoringSnapshot) return;

            var snapshot = _labels.Select(l => l.Clone()).ToList();
            _undoStack.Push(snapshot);
            _redoStack.Clear(); // Any new action clears the redo stack
        }

        public void Undo()
        {
            if (_undoStack.Count == 0) return;

            _isRestoringSnapshot = true;
            // Save current state to Redo stack
            _redoStack.Push(_labels.Select(l => l.Clone()).ToList());

            var previousState = _undoStack.Pop(); System.IO.File.AppendAllText("undo_debug.txt", "Restoring snapshot with " + previousState.Count + " labels\n");
            _labels.Clear();
            _labels.AddRange(previousState.Select(l => l.Clone()));

            _isRestoringSnapshot = false;

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        public void Redo()
        {
            if (_redoStack.Count == 0) return;

            _isRestoringSnapshot = true;
            // Save current state to Undo stack
            _undoStack.Push(_labels.Select(l => l.Clone()).ToList());

            var nextState = _redoStack.Pop();
            _labels.Clear();
            _labels.AddRange(nextState.Select(l => l.Clone()));

            _isRestoringSnapshot = false;

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            SheetModified?.Invoke(this, EventArgs.Empty);
            InvalidateVisual();
        }

        #endregion
    }
}








