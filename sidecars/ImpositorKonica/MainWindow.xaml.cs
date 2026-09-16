using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using ImpositorKonica.Dialogs;
using ImpositorKonica.Export;
using ImpositorKonica.Models;
using Microsoft.Win32;

namespace ImpositorKonica
{
    /// <summary>
    /// Janela principal da mesa de imposição nativa C# WPF (Estilo Kodak Preps).
    /// </summary>
    public partial class MainWindow : Window
    {
        private readonly ImpositionPayload _payload;
        private List<ImpositionItemDto> _allItems = new();

        public MainWindow(ImpositionPayload payload)
        {
            InitializeComponent();
            _payload = payload;

            Loaded += OnWindowLoaded;
            Closed += (s, e) => Environment.Exit(App.ExitCodeResult);
        }

        private void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            _allItems = _payload.Items ?? new List<ImpositionItemDto>();
            ItemsList.ItemsSource = _allItems;

            // Inicializa o canvas métrico com os parâmetros da chapa
            CanvasImpositor.LoadPayload(_payload);

            CanvasImpositor.SheetModified += (s, ev) => UpdateStatus();
            CanvasImpositor.SelectionChanged += (s, ev) => UpdateStatus();

            UpdateStatus();
        }

        private void UpdateStatus()
        {
            bool isVertical = CanvasImpositor.ActiveRotation == 90;
            int totalCapacity = isVertical ? 40 : 36;
            int currentCount = CanvasImpositor.PlacedLabels.Count;
            int percent = totalCapacity > 0 ? (int)Math.Round((double)currentCount / totalCapacity * 100) : 0;

            TxtOccupancyStatus.Text = $"Ocupação: {currentCount} de {totalCapacity} posições ({percent}%)";
            BtnOrientation.Content = isVertical ? "Vertical (8x5 = 40 un)" : "Horizontal (3x12 = 36 un)";
            TxtSheetMetrics.Text = $"{CanvasImpositor.SheetName}: {CanvasImpositor.SheetWidthMm}x{CanvasImpositor.SheetHeightMm} mm | Útil: {CanvasImpositor.SheetWidthMm - 2 * CanvasImpositor.MarginMm}x{CanvasImpositor.SheetHeightMm - 2 * CanvasImpositor.MarginMm} mm | Margem: {CanvasImpositor.MarginMm}mm | Gap: {CanvasImpositor.GapMm}mm";
            UpdateSelectionCoordinates();
        }

        private void UpdateSelectionCoordinates()
        {
            var na = CultureInfo.InvariantCulture;
            var bounds = CanvasImpositor.GetSelectionBounds();

            TxtCoordX.Text = bounds.HasValue ? bounds.Value.X.ToString("0.00", na) + " mm" : "0,00 mm";
            TxtCoordY.Text = bounds.HasValue ? bounds.Value.Y.ToString("0.00", na) + " mm" : "0,00 mm";
            TxtCoordL.Text = bounds.HasValue ? bounds.Value.Width.ToString("0.00", na) + " mm" : "0,00 mm";
            TxtCoordA.Text = bounds.HasValue ? bounds.Value.Height.ToString("0.00", na) + " mm" : "0,00 mm";
        }

        #region Memória Muscular Gráfica (Teclas de Atalho)

        private void OnWindowKeyDown(object sender, KeyEventArgs e)
        {
            if (e.OriginalSource is System.Windows.Controls.TextBox || e.OriginalSource is System.Windows.Controls.PasswordBox)
                return; // Allow native TextBox shortcuts (like Ctrl+Z for text undo)

            // Ignorar se o foco estiver digitando no campo de busca
            if (TxtSearch.IsFocused) return;

            // F4: Zoom Extents
            if (e.Key == Key.F4)
            {
                CanvasImpositor.ZoomExtents();
                e.Handled = true;
                return;
            }

            // Ctrl + N: Configurar chapa (Novo documento)
            if (e.Key == Key.N && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                OpenSheetConfigDialog();
                e.Handled = true;
                return;
            }

            // Ctrl + S: Salvar PDF de pré-impressão
            if (e.Key == Key.S && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                SavePdfToFile();
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

            // Ctrl + Z: Desfazer | Ctrl + Y: Refazer | Ctrl + Shift + Z: Refazer
            if (e.Key == Key.Z)
            {
                if (Keyboard.Modifiers == ModifierKeys.Control)
                {
                    CanvasImpositor.Undo();
                    e.Handled = true;
                    return;
                }
                else if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
                {
                    CanvasImpositor.Redo();
                    e.Handled = true;
                    return;
                }
            }
            if (e.Key == Key.Y && Keyboard.Modifiers == ModifierKeys.Control)
            {
                CanvasImpositor.Redo();
                e.Handled = true;
                return;
            }

            // Ctrl + G: Agrupar | Ctrl + Shift + G: Desagrupar
            if (e.Key == Key.G && (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
            {
                if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift)
                {
                    CanvasImpositor.UngroupSelected();
                }
                else
                {
                    CanvasImpositor.GroupSelected();
                }
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

        private void OnToggleAutoGang(object sender, RoutedEventArgs e)
        {
            if (BtnAutoGang.IsChecked == true)
            {
                if (_allItems.Count == 0)
                {
                    BtnAutoGang.IsChecked = false;
                    MessageBox.Show("Nenhum item disponível para imposição automática.", "AutoGang", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }
                CanvasImpositor.ExecuteAutoGang(_allItems);
            }
            UpdateStatus();
        }

        private void OnToggleCropMarks(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.ShowCropMarks = BtnCropMarks.IsChecked == true;
        }

        private void OnGroupClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.GroupSelected();
            UpdateStatus();
        }

        private void OnUngroupClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.UngroupSelected();
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

        private void OnMenuSavePdfClick(object sender, RoutedEventArgs e) => SavePdfToFile();

        private void SavePdfToFile()
        {
            if (CanvasImpositor.PlacedLabels.Count == 0)
            {
                MessageBox.Show("A folha está vazia. Adicione ao menos uma etiqueta antes de gerar o PDF.", "Folha Vazia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var dialog = new SaveFileDialog
            {
                Title = "Salvar PDF de pré-impressão SRA3",
                Filter = "Arquivos PDF (*.pdf)|*.pdf",
                DefaultExt = ".pdf",
                AddExtension = true,
                FileName = $"Imposicao_Konica_SRA3_{DateTime.Now:yyyyMMdd_HHmm}.pdf",
                InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)
            };

            if (dialog.ShowDialog() != true) return;

            try
            {
                var config = new SheetConfig
                {
                    Name = CanvasImpositor.SheetName,
                    WidthMm = CanvasImpositor.SheetWidthMm,
                    HeightMm = CanvasImpositor.SheetHeightMm,
                    MarginMm = CanvasImpositor.MarginMm,
                    GapMm = CanvasImpositor.GapMm,
                    IsLandscape = CanvasImpositor.ActiveRotation == 0
                };

                Export.SkiaPdfExporter.ExportarParaPdf(
                    dialog.FileName,
                    CanvasImpositor.PlacedLabels,
                    config,
                    CanvasImpositor.ActiveRotation == 90,
                    CanvasImpositor.ShowCropMarks
                );

                // Revela o arquivo no Explorer com seleção
                Process.Start("explorer.exe", $"/select,\"{dialog.FileName}\"");

                App.ExitCodeResult = 0; // Código 0: PDF gerado com sucesso
                Close();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ImpositorKonica] Falha ao gerar PDF: {ex.Message}");
                App.ExitCodeResult = 3; // Código 3: Erro de exportação
                MessageBox.Show($"Erro ao gerar o PDF com SkiaSharp:\n{ex.Message}", "Erro na Exportação", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // Window Controls
        private void OnMinClick(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
        private void OnMaxClick(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        private void OnCloseClick(object sender, RoutedEventArgs e)
        {
            App.ExitCodeResult = 1;
            Close();
        }

        // Menu Handlers
        private void OnMenuConfigSheetClick(object sender, RoutedEventArgs e) => OpenSheetConfigDialog();

        private void OpenSheetConfigDialog()
        {
            var dialog = new ConfigurarFolhaDialog(new SheetConfig
            {
                Name = "Imposicao_Konica_01",
                WidthMm = CanvasImpositor.SheetWidthMm,
                HeightMm = CanvasImpositor.SheetHeightMm,
                MarginMm = CanvasImpositor.MarginMm,
                GapMm = CanvasImpositor.GapMm,
                IsLandscape = CanvasImpositor.ActiveRotation == 0
            })
            {
                Owner = this
            };

            if (dialog.ShowDialog() == true && dialog.Result != null)
            {
                var cfg = dialog.Result;
                CanvasImpositor.SheetWidthMm = cfg.WidthMm;
                CanvasImpositor.SheetHeightMm = cfg.HeightMm;
                CanvasImpositor.MarginMm = cfg.MarginMm;
                CanvasImpositor.GapMm = cfg.GapMm;
                CanvasImpositor.ActiveRotation = cfg.IsLandscape ? 0 : 90;
                CanvasImpositor.ExecuteAutoGang(_allItems);
                CanvasImpositor.ZoomExtents();
                UpdateStatus();
            }
        }
        private void OnMenuCloseClick(object sender, RoutedEventArgs e) => OnCloseClick(sender, e);
        private void OnMenuUndoClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.Undo();
        }

        private void OnMenuRedoClick(object sender, RoutedEventArgs e)
        {
            CanvasImpositor.Redo();
        }
        private void OnMenuClearSheetClick(object sender, RoutedEventArgs e) => OnClearSheetClick(sender, e);
        private void OnMenuRotateClick(object sender, RoutedEventArgs e)
        {
            // Simula o atalho 'R' se implementado
        }
        private void OnMenuSelectAllClick(object sender, RoutedEventArgs e) { /* Em breve */ }
        private void OnMenuDeselectAllClick(object sender, RoutedEventArgs e) { /* Em breve */ }
        private void OnMenuInvertSelectionClick(object sender, RoutedEventArgs e) { /* Em breve */ }
        private void OnMenuToggleCropMarks(object sender, RoutedEventArgs e) => OnToggleCropMarks(sender, e);
        private void OnMenuShortcutsClick(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("F4: Enquadrar\nP: Centralizar\nC/E: Alinhar\nT/B/L/R: Bordas\nCtrl+G: Agrupar\nCtrl+Shift+G: Desagrupar\nCtrl+S: Salvar PDF\nDel: Remover", "Atalhos", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        private void OnMenuAboutClick(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("Impositor Konica SRA3\nGraficaOS Native Pre-press", "Sobre", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        #endregion
    }
}
