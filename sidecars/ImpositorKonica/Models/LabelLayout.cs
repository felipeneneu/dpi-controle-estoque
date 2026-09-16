namespace ImpositorKonica.Models
{
    /// <summary>
    /// Especificação única do layout nativo da etiqueta (90 x 35 mm).
    /// Fonte única de verdade compartilhada entre o canvas (tela) e o gerador de PDF,
    /// garantindo que a exportação reproduza milimetricamente o que a tela exibe.
    /// </summary>
    public static class LabelLayout
    {
        public const double NativeWidth = 90.0;
        public const double NativeHeight = 35.0;

        public const double QrSize = 24.0;
        public const double QrOffsetX = 4.0;
        public const double QrOffsetY = (NativeHeight - QrSize) / 2.0;
        public const double QrScale = QrSize / 100.0;

        public const double TextStartX = 32.0;
        public const double CodeFontSize = 3.9;
        public const double TitleFontSize = 2.8;
        public const double MetaFontSize = 2.5;

        public const double CodeY = 3.0;
        public const double TitleY = 9.2;
        public const double SubtitleY = 13.6;
        public const double MetaLineStep = 3.5;

        public const int TitleMaxChars = 30;

        public static string Truncate(string? val, int max)
        {
            if (string.IsNullOrEmpty(val)) return string.Empty;
            return val.Length <= max ? val : val.Substring(0, max - 1) + "…";
        }
    }
}