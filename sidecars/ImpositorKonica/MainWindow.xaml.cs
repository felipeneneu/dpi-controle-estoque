using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using ImpositorKonica.Models;

namespace ImpositorKonica
{
    public partial class MainWindow : Window
    {
        private ImpositionPayload _payload;
        private List<ImpositionItemDto> _allItems = new();

        public MainWindow() : this(ImpositionPayload.CreateMock())
        {
        }

        public MainWindow(ImpositionPayload payload)
        {
            InitializeComponent();
            _payload = payload ?? ImpositionPayload.CreateMock();

            Loaded += (s, e) =>
            {
                UpdatePayload(_payload);
            };

            CanvasImpositor.SheetModified += (s, ev) => UpdateStatus();
            CanvasImpositor.SelectionChanged += (s, ev) => UpdateStatus();
        }

        /// <summary>
        /// Atualiza os dados da mesa de imposição em tempo real (chamado via IPC Named Pipe do Electron).
        /// Executado na thread de UI via Dispatcher.
        /// </summary>
        public void UpdatePayload(ImpositionPayload payload)
        {
            _payload = payload ?? ImpositionPayload.CreateMock();
            _allItems = _payload.Items != null ? new List<ImpositionItemDto>(_payload.Items) : new List<ImpositionItemDto>();

            ItemsList.ItemsSource = _allItems;

            // Inicializa e auto-impõe na chapa métrica com geração de QR codes e marcas
            CanvasImpositor.LoadPayload(_payload);

            UpdateStatus();

            // Traz a janela para foco e visibilidade no Windows
            BringToForeground();
        }

        public void BringToForeground()
        {
            if (WindowState == WindowState.Minimized)
            {
                WindowState = WindowState.Normal;
            }
            Activate();
            Topmost = true;
            Topmost = false;
            Focus();
        }

        private void UpdateStatus()
        {
            bool isVertical = CanvasImpositor.ActiveRotation == 90;
            int totalCapacity = isVertical ? 40 : 36;
            int currentCount = CanvasImpositor.PlacedLabels.Count;
            int percent = totalCapacity > 0 ? (int)Math.Round((double)currentCount / totalCapacity * 100) : 0;

            TxtOccupancyStatus.Text = $"Ocupação: {currentCount} de {totalCapacity} posições ({percent}%)";
            BtnOrientation.Content = isVertical ? "Vertical (8x5 = 40 un)" : "Horizontal (3x12 = 36 un)";
            TxtSheetMetrics.Text = $"Folha SRA3: {CanvasImpositor.SheetWidthMm}x{CanvasImpositor.SheetHeightMm} mm | Útil: {CanvasImpositor.SheetWidthMm - 2 * CanvasImpositor.MarginMm}x{CanvasImpositor.SheetHeightMm - 2 * CanvasImpositor.MarginMm} mm | Margem: {CanvasImpositor.MarginMm}mm | Gap: {CanvasImpositor.GapMm}mm";
        }

        #region Memória Muscular Gráfica (Teclas de Atalho)

        private void OnWindowKeyDown(object sender, KeyEventArgs e)
        {
            if (TxtSearch.IsFocused) return;

            // F4: Zoom Extents
            if (e.Key == Key.F4)
            {
                CanvasImpositor.ZoomExtents();
                e.Handled = true;
                return;
            }

            // Ctrl + D: Duplicar
            if (e.Key == Key.D && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                CanvasImpositor.DuplicateSelected();
                e.Handled = true;
                return;
            }

            // Delete: Excluir seleção
            if (e.Key == Key.Delete)
            {
                CanvasImpositor.DeleteSelected();
                e.Handled = true;
                return;
            }

            // P: Centralizar na Folha
            if (e.Key == Key.P)
            {
                CanvasImpositor.CenterSelectedOnSheet();
                e.Handled = true;
                return;
            }

            // C: Alinhar centros horizontais
            if (e.Key == Key.C)
            {
                CanvasImpositor.AlignSelectedCentersHorizontal();
                e.Handled = true;
                return;
            }

            // E: Alinhar centros verticais
            if (e.Key == Key.E)
            {
                CanvasImpositor.AlignSelectedCentersVertical();
                e.Handled = true;
                return;
            }

            // T, B, L, R: Top, Bottom, Left, Right
            if (e.Key == Key.T)
            {
                CanvasImpositor.AlignSelectedTop();
                e.Handled = true;
                return;
            }
            if (e.Key == Key.B)
            {
                CanvasImpositor.AlignSelectedBottom();
                e.Handled = true;
                return;
            }
            if (e.Key == Key.L)
            {
                CanvasImpositor.AlignSelectedLeft();
                e.Handled = true;
                return;
            }
            if (e.Key == Key.R)
            {
                CanvasImpositor.AlignSelectedRight();
                e.Handled = true;
                return;
            }

            // Esc: Cancelar
            if (e.Key == Key.Escape)
            {
                App.ExitCodeResult = 1; // 1 = Cancelado
                Close();
                e.Handled = true;
            }
        }

        #endregion

        #region Ações da Barra Superior

        private void OnZoomInClick(object sender, RoutedEventArgs e) => CanvasImpositor.ZoomIn();
        private void OnZoomOutClick(object sender, RoutedEventArgs e) => CanvasImpositor.ZoomOut();
        private void OnZoom100Click(object sender, RoutedEventArgs e) => CanvasImpositor.ResetZoom100();
        private void OnZoomExtentsClick(object sender, RoutedEventArgs e) => CanvasImpositor.ZoomExtents();

        private void OnToggleOrientationClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.ToggleOrientation();
            UpdateStatus();
        }

        private void OnAutoGangClick(object sender, RoutedEventArgs e)
        {
            if (_allItems.Count == 0)
            {
                MessageBox.Show("Nenhum item disponível para imposição automática.", "AutoGang", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            CanvasImpositor.ExecuteAutoGang(_allItems);
            UpdateStatus();
        }

        private void OnCenterSheetClick(object sender, RoutedEventArgs e) => CanvasImpositor.CenterSelectedOnSheet();
        private void OnAlignCentersHClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedCentersHorizontal();
        private void OnAlignCentersVClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedCentersVertical();
        private void OnAlignTopClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedTop();
        private void OnAlignBottomClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedBottom();
        private void OnAlignLeftClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedLeft();
        private void OnAlignRightClick(object sender, RoutedEventArgs e) => CanvasImpositor.AlignSelectedRight();

        private void OnClearSheetClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.ClearSheet();
            UpdateStatus();
        }

        private void OnAddItemClick(object sender, RoutedEventArgs e)
        {
            if ((sender as Button)?.Tag is ImpositionItemDto item)
            {
                CanvasImpositor.AddLabel(item);
                UpdateStatus();
            }
        }

        private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
        {
            string q = TxtSearch.Text.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(q))
            {
                ItemsList.ItemsSource = _allItems;
            }
            else
            {
                ItemsList.ItemsSource = _allItems.Where(i =>
                    (i.Code?.ToLowerInvariant().Contains(q) ?? false) ||
                    (i.Title?.ToLowerInvariant().Contains(q) ?? false) ||
                    (i.Subtitle?.ToLowerInvariant().Contains(q) ?? false)
                ).ToList();
            }
        }

        private void OnPrintToKonicaClick(object sender, RoutedEventArgs e)
        {
            if (CanvasImpositor.PlacedLabels.Count == 0)
            {
                MessageBox.Show("A folha está vazia. Adicione ao menos uma etiqueta antes de enviar para impressão.", "Folha Vazia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                var printDialog = new PrintDialog();
                if (printDialog.ShowDialog() == true)
                {
                    printDialog.PrintVisual(CanvasImpositor, "Imposicao Konica SRA3 - GraficaOS");
                    App.ExitCodeResult = 0; // Código 0: Impresso com sucesso
                    Close();
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Falha no spooler de impressão: {ex.Message}");
                App.ExitCodeResult = 3; // Código 3: Erro de impressão
                MessageBox.Show($"Erro na comunicação com a fila de impressão do Windows:\n{ex.Message}", "Erro de Impressão", MessageBoxButton.OK, MessageBoxImage.Error);
                Environment.Exit(3);
            }
        }

        #endregion
    }
}
