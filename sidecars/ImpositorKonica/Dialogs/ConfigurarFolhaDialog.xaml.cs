using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using ImpositorKonica.Models;

namespace ImpositorKonica.Dialogs
{
    /// <summary>
    /// Janela modal "Novo documento" — configuração de chapa e dimensões de folha.
    /// Clone de ergonomia do diálogo Adobe Illustrator (paleta Spectrum Dark).
    /// Unidade canônica interna: milímetros. A unidade de exibição é conversível.
    /// </summary>
    public partial class ConfigurarFolhaDialog : Window
    {
        private enum Unit { Mm, Pt, Cm }

        // Estado canônico (sempre em mm)
        private string _name;
        private double _widthMm;
        private double _heightMm;
        private double _gapMm;

        // Margens (em mm): 0 = Superior, 1 = Inferior, 2 = Esquerda, 3 = Direita
        private readonly double[] _marginsMm = new double[4];

        private Unit _unit = Unit.Mm;
        private bool _suppress;
        private bool _presetsReady;

        /// <summary>Configuração confirmada pelo usuário (null se cancelado).</summary>
        public SheetConfig? Result { get; private set; }

        public ConfigurarFolhaDialog(SheetConfig? current = null)
        {
            InitializeComponent();

            _name = !string.IsNullOrWhiteSpace(current?.Name) ? current!.Name : "Imposicao_Konica_01";
            _widthMm = current?.WidthMm > 0 ? current.WidthMm : 330.0;
            _heightMm = current?.HeightMm > 0 ? current.HeightMm : 480.0;
            _gapMm = current != null ? current.GapMm : 3.0;
            double margin = current?.MarginMm >= 0 ? current.MarginMm : 5.0;
            for (int i = 0; i < 4; i++) _marginsMm[i] = margin;

            PresetsList.ItemsSource = SheetPreset.All;

            Loaded += OnDialogLoaded;
        }

        private void OnDialogLoaded(object sender, RoutedEventArgs e)
        {
            SelectMatchingPreset();
            RefreshAllFields();
            TxtName.Focus();
        }

        // ------------------------------------------------------------ Predefinições

        private void SelectMatchingPreset()
        {
            _presetsReady = true;

            SheetPreset? match = null;
            SheetPreset? custom = null;
            foreach (var item in PresetsList.Items)
            {
                if (item is not SheetPreset preset) continue;
                if (preset.IsCustom)
                {
                    custom = preset;
                    continue;
                }
                if (Math.Abs(preset.WidthMm - _widthMm) < 0.5 && Math.Abs(preset.HeightMm - _heightMm) < 0.5)
                {
                    match = preset;
                    break;
                }
            }

            var target = match ?? custom;
            if (target != null)
            {
                var radio = GetPresetRadio(PresetsList, target);
                if (radio != null) radio.IsChecked = true;
            }
        }

        private static RadioButton? GetPresetRadio(ItemsControl list, object item)
        {
            var container = list.ItemContainerGenerator.ContainerFromItem(item) as FrameworkElement;
            return container == null ? null : FindDescendant<RadioButton>(container);
        }

        private static T? FindDescendant<T>(DependencyObject root) where T : DependencyObject
        {
            int count = VisualTreeHelper.GetChildrenCount(root);
            for (int i = 0; i < count; i++)
            {
                var child = VisualTreeHelper.GetChild(root, i);
                if (child is T t) return t;
                var nested = FindDescendant<T>(child);
                if (nested != null) return nested;
            }
            return null;
        }

        private void OnPresetChecked(object sender, RoutedEventArgs e)
        {
            if (!_presetsReady || _suppress) return;
            if (sender is not RadioButton { DataContext: SheetPreset preset } || preset.IsCustom) return;

            _suppress = true;
            _widthMm = preset.WidthMm;
            _heightMm = preset.HeightMm;
            SyncOrientationRadios();
            UpdateDimensionBoxes();
            _suppress = false;
        }

        // ------------------------------------------------------------ Exibição

        private void RefreshAllFields()
        {
            _suppress = true;
            TxtName.Text = _name;
            TxtGap.Text = FormatNum(_gapMm);
            TxtMarginTop.Text = FormatNum(_marginsMm[0]);
            TxtMarginBottom.Text = FormatNum(_marginsMm[1]);
            TxtMarginLeft.Text = FormatNum(_marginsMm[2]);
            TxtMarginRight.Text = FormatNum(_marginsMm[3]);
            SyncOrientationRadios();
            UpdateDimensionBoxes();
            UpdateChainIcon();
            _suppress = false;
        }

        private void UpdateDimensionBoxes()
        {
            TxtWidth.Text = FormatNum(MmToUnit(_widthMm));
            TxtHeight.Text = FormatNum(MmToUnit(_heightMm));
        }

        private void SyncOrientationRadios()
        {
            bool landscape = _widthMm >= _heightMm;
            BtnPortrait.IsChecked = !landscape;
            BtnLandscape.IsChecked = landscape;
        }

        private void UpdateChainIcon()
        {
            if (ChainIcon == null) return;
            ChainIcon.Fill = new SolidColorBrush(
                BtnLinkMargins.IsChecked == true
                    ? Color.FromRgb(0x14, 0x73, 0xE6)
                    : Color.FromRgb(0x9E, 0x9E, 0x9E));
        }

        // ------------------------------------------------------------ Dimensões e Unidades

        private void OnDimensionChanged(object sender, TextChangedEventArgs e)
        {
            if (_suppress) return;

            if (TryParseNumber(TxtWidth.Text, out var wVal) && TryParseNumber(TxtHeight.Text, out var hVal))
            {
                if (_unit == Unit.Pt)
                {
                    _widthMm = PtToMm(wVal);
                    _heightMm = PtToMm(hVal);
                }
                else if (_unit == Unit.Cm)
                {
                    _widthMm = CmToMm(wVal);
                    _heightMm = CmToMm(hVal);
                }
                else
                {
                    _widthMm = wVal;
                    _heightMm = hVal;
                }

                _suppress = true;
                SyncOrientationRadios();
                _suppress = false;
            }
        }

        private void OnUnitsChanged(object sender, SelectionChangedEventArgs e)
        {
            if (CmbUnits.SelectedIndex < 0) return;

            // Reconverte o valor digitado (na unidade antiga) para mm antes de trocar a exibição
            if (!_suppress)
            {
                if (TryParseNumber(TxtWidth.Text, out var wCur) && TryParseNumber(TxtHeight.Text, out var hCur))
                {
                    _widthMm = UnitToMm(wCur);
                    _heightMm = UnitToMm(hCur);
                }
            }

            _unit = CmbUnits.SelectedIndex switch
            {
                1 => Unit.Pt,
                2 => Unit.Cm,
                _ => Unit.Mm
            };

            _suppress = true;
            UpdateDimensionBoxes();
            _suppress = false;
        }

        // ------------------------------------------------------------ Orientação

        private void OnOrientationChanged(object sender, RoutedEventArgs e)
        {
            if (_suppress) return;

            bool landscape = BtnLandscape.IsChecked == true;
            if (landscape != (_widthMm >= _heightMm))
            {
                (_widthMm, _heightMm) = (_heightMm, _widthMm);
                _suppress = true;
                UpdateDimensionBoxes();
                _suppress = false;
            }
        }

        // ------------------------------------------------------------ Margens

        private void OnMarginChanged(object sender, TextChangedEventArgs e)
        {
            if (_suppress || sender is not TextBox tb || !TryParseNumber(tb.Text, out var v)) return;

            int idx = tb.Name switch
            {
                nameof(TxtMarginTop) => 0,
                nameof(TxtMarginBottom) => 1,
                nameof(TxtMarginLeft) => 2,
                _ => 3
            };
            _marginsMm[idx] = v;

            if (BtnLinkMargins.IsChecked == true)
            {
                _suppress = true;
                string text = FormatNum(v);
                TxtMarginTop.Text = text;
                TxtMarginBottom.Text = text;
                TxtMarginLeft.Text = text;
                TxtMarginRight.Text = text;
                _suppress = false;
            }
        }

        private void OnLinkMarginsChanged(object sender, RoutedEventArgs e)
        {
            if (_suppress || ChainIcon == null || TxtMarginTop == null) return;
            UpdateChainIcon();

            if (BtnLinkMargins.IsChecked == true)
            {
                double master = _marginsMm[0];
                _suppress = true;
                string text = FormatNum(master);
                TxtMarginTop.Text = text;
                TxtMarginBottom.Text = text;
                TxtMarginLeft.Text = text;
                TxtMarginRight.Text = text;
                _suppress = false;
            }
        }

        // ------------------------------------------------------------ Gap

        private void OnGapChanged(object sender, TextChangedEventArgs e)
        {
            if (!_suppress && TryParseNumber(TxtGap.Text, out var v))
            {
                _gapMm = v;
            }
        }

        private void OnGapDecreaseClick(object sender, RoutedEventArgs e) => StepGap(-0.5);
        private void OnGapIncreaseClick(object sender, RoutedEventArgs e) => StepGap(0.5);

        private void StepGap(double delta)
        {
            double next = Math.Round((_gapMm + delta) * 2) / 2.0;
            next = Math.Clamp(next, 0.0, 50.0);
            _gapMm = next;
            _suppress = true;
            TxtGap.Text = FormatNum(next);
            _suppress = false;
        }

        // ------------------------------------------------------------ Debug de input numérico

        private void OnNumberPreviewInput(object sender, TextCompositionEventArgs e)
        {
            if (sender is TextBox tb)
            {
                string full = tb.Text.Insert(tb.SelectionStart, e.Text);
                if (!IsValidNumberText(full)) e.Handled = true;
            }
        }

        private static bool IsValidNumberText(string s) =>
            string.IsNullOrEmpty(s) || double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _) ||
            double.TryParse(s, NumberStyles.Float, CultureInfo.CurrentCulture, out _);

        // ------------------------------------------------------------ Ações finais

        private void OnApplyClick(object sender, RoutedEventArgs e)
        {
            // Garante estado consistente antes de confirmar
            if (TryParseNumber(TxtWidth.Text, out var w) && TryParseNumber(TxtHeight.Text, out var h) &&
                w > 0 && h > 0)
            {
                _widthMm = UnitToMm(w);
                _heightMm = UnitToMm(h);
            }

            Result = new SheetConfig
            {
                Name = string.IsNullOrWhiteSpace(TxtName.Text) ? "Imposicao_Konica_01" : TxtName.Text.Trim(),
                WidthMm = _widthMm,
                HeightMm = _heightMm,
                MarginMm = _marginsMm[0],
                GapMm = _gapMm,
                IsLandscape = _widthMm >= _heightMm
            };
            DialogResult = true;
        }

        private void OnCloseClick(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
        }

        // ------------------------------------------------------------ Janela

        private void OnTitleBarDrag(object sender, MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed && e.ButtonState == MouseButtonState.Pressed)
            {
                DragMove();
            }
        }

        private void OnWindowKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                e.Handled = true;
            }
            else if (e.Key == Key.Enter)
            {
                OnApplyClick(sender, e);
                e.Handled = true;
            }
        }

        // ------------------------------------------------------------ Conversões numéricas

        private double MmToUnit(double mm) => _unit switch
        {
            Unit.Pt => mm * 72.0 / 25.4,
            Unit.Cm => mm / 10.0,
            _ => mm
        };

        private double UnitToMm(double v) => _unit switch
        {
            Unit.Pt => v * 25.4 / 72.0,
            Unit.Cm => v * 10.0,
            _ => v
        };

        private static double PtToMm(double pt) => pt * 25.4 / 72.0;
        private static double CmToMm(double cm) => cm * 10.0;

        private static string FormatNum(double v) =>
            v.ToString("0.###", CultureInfo.InvariantCulture);

        private static bool TryParseNumber(string s, out double v) =>
            double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v) ||
            double.TryParse(s, NumberStyles.Float, CultureInfo.CurrentCulture, out v);
    }
}