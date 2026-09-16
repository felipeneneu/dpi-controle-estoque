using System.Collections.Generic;

namespace ImpositorKonica.Models
{
    /// <summary>
    /// Resultado da janela "Novo documento" — parâmetros físicos da chapa/ficha.
    /// Valores canônicos sempre em milímetros; a UI converte conforme a unidade ativa.
    /// </summary>
    public class SheetConfig
    {
        public string Name { get; set; } = "Imposicao_Konica_01";
        public double WidthMm { get; set; } = 330.0;
        public double HeightMm { get; set; } = 480.0;
        public double MarginMm { get; set; } = 5.0;
        public double GapMm { get; set; } = 3.0;
        public bool IsLandscape { get; set; }
    }

    /// <summary>
    /// Predefinição de folha física exibida como card no grid esquerdo do diálogo.
    /// </summary>
    public sealed class SheetPreset
    {
        public SheetPreset(string key, string name, string subtitle, double widthMm, double heightMm)
        {
            Key = key;
            Name = name;
            Subtitle = subtitle;
            WidthMm = widthMm;
            HeightMm = heightMm;
        }

        public string Key { get; }
        public string Name { get; }
        public string Subtitle { get; }
        public double WidthMm { get; }
        public double HeightMm { get; }
        public bool IsLandscape => WidthMm >= HeightMm;
        public bool IsCustom => Key == "custom";

        public static IReadOnlyList<SheetPreset> All { get; } = new[]
        {
            new SheetPreset("sra3",   "SRA3 (Konica)",   "330 × 480 mm",               330.0, 480.0),
            new SheetPreset("a3p",    "A3+ (Super A3)",  "329 × 483 mm",               329.0, 483.0),
            new SheetPreset("a3",     "A3",              "297 × 420 mm",               297.0, 420.0),
            new SheetPreset("a4",     "A4",              "210 × 297 mm",               210.0, 297.0),
            new SheetPreset("roll106","Bobina 1.06m",    "1060 × 500 mm (Amostra)",    1060.0, 500.0),
            new SheetPreset("roll152","Bobina 1.52m",    "1520 × 500 mm (Amostra)",    1520.0, 500.0),
            new SheetPreset("custom", "Personalizado",   "Definição manual de medidas", 0.0,    0.0),
        };
    }
}