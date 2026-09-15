using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using System.Windows;

namespace ImpositorKonica.Models
{
    public class ImpositionPayload
    {
        [JsonPropertyName("sheetWidthMm")]
        public double SheetWidthMm { get; set; } = 330.0;

        [JsonPropertyName("sheetHeightMm")]
        public double SheetHeightMm { get; set; } = 480.0;

        [JsonPropertyName("marginMm")]
        public double MarginMm { get; set; } = 5.0;

        [JsonPropertyName("gapMm")]
        public double GapMm { get; set; } = 3.0;

        [JsonPropertyName("defaultRotation")]
        public int DefaultRotation { get; set; } = 90; // 90 = Vertical (40 un), 0 = Horizontal (36 un)

        [JsonPropertyName("operatorName")]
        public string? OperatorName { get; set; } = "Operador Konica";

        [JsonPropertyName("machineTarget")]
        public string? MachineTarget { get; set; } = "Konica Minolta bizhub PRO";

        [JsonPropertyName("createdAt")]
        public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("items")]
        public List<ImpositionItemDto> Items { get; set; } = new();

        public static ImpositionPayload CreateMock()
        {
            return new ImpositionPayload
            {
                SheetWidthMm = 330.0,
                SheetHeightMm = 480.0,
                MarginMm = 5.0,
                GapMm = 3.0,
                DefaultRotation = 90,
                OperatorName = "Felipe (Mock Local)",
                MachineTarget = "Konica Minolta C3070",
                CreatedAt = DateTime.UtcNow,
                Items = new List<ImpositionItemDto>
                {
                    new()
                    {
                        Id = "mock-1",
                        Code = "#1042",
                        Title = "Bobina Vinil Adesivo 1.37m",
                        Subtitle = "1.37m · Brilho",
                        Details = "50m · Estoque Central",
                        Type = "bobina",
                        QrPayload = "BOB:1042",
                        InitialQuantity = 10
                    },
                    new()
                    {
                        Id = "mock-2",
                        Code = "#0374",
                        Title = "Lona 280g Brilho 1.60m",
                        Subtitle = "1.60m · Frontlit",
                        Details = "50m · Depósito A",
                        Type = "bobina",
                        QrPayload = "BOB:0374",
                        InitialQuantity = 10
                    },
                    new()
                    {
                        Id = "mock-3",
                        Code = "#5431",
                        Title = "DP100GTS Brilho 1.06m",
                        Subtitle = "1.06m · Adesivo",
                        Details = "45m · Prateleira B",
                        Type = "bobina",
                        QrPayload = "BOB:5431",
                        InitialQuantity = 10
                    },
                    new()
                    {
                        Id = "mock-4",
                        Code = "#T-CY",
                        Title = "Tinta Cyan UV Mimaki",
                        Subtitle = "Cyan UV Original",
                        Details = "1000ml · Gaveta Tintas",
                        Type = "tinta",
                        QrPayload = "TNK:TCY",
                        InitialQuantity = 10
                    }
                }
            };
        }
    }

    public class ImpositionItemDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("code")]
        public string Code { get; set; } = "#0000";

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("subtitle")]
        public string? Subtitle { get; set; }

        [JsonPropertyName("details")]
        public string? Details { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = "bobina";

        [JsonPropertyName("qrPayload")]
        public string QrPayload { get; set; } = string.Empty;

        [JsonPropertyName("initialQuantity")]
        public int InitialQuantity { get; set; } = 1;
    }

    /// <summary>
    /// Representa uma etiqueta física posicionada na mesa de montagem métrica (em mm).
    /// </summary>
    public class PlacedLabel
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public double X { get; set; }
        public double Y { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public int Rotation { get; set; } // 0 ou 90 graus
        public ImpositionItemDto Item { get; set; }
        public bool IsSelected { get; set; }

        public PlacedLabel(ImpositionItemDto item, double x, double y, double width, double height, int rotation)
        {
            Item = item;
            X = x;
            Y = y;
            Width = width;
            Height = height;
            Rotation = rotation;
        }

        public Rect GetBounds() => new Rect(X, Y, Width, Height);
    }
}
