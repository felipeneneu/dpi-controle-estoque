using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using ImpositorKonica.Models;
using SkiaSharp;
using QRCoder;

namespace ImpositorKonica.Export
{
    public static class SkiaPdfExporter
    {
        private const float MmToPt = 72f / 25.4f;

        public static void ExportarParaPdf(
            string filePath,
            IReadOnlyList<PlacedLabel> labels,
            SheetConfig sheetConfig,
            bool isVertical, // Recebido conforme exigência do prompt, embora já resolvido nos PlacedLabels
            bool showCropMarks)
        {
            float pageWidthPt = (float)sheetConfig.WidthMm * MmToPt;
            float pageHeightPt = (float)sheetConfig.HeightMm * MmToPt;

            using var stream = File.OpenWrite(filePath);
            using var document = SKDocument.CreatePdf(stream);
            using var canvas = document.BeginPage(pageWidthPt, pageHeightPt);

            // Cores CMYK usando espaço de cor genérico do PDF onde Preto Puro = K100
            using var paintBlackFill = new SKPaint
            {
                Color = SKColors.Black,
                Style = SKPaintStyle.Fill,
                IsAntialias = true
            };

            using var paintBlackStroke1pt = new SKPaint
            {
                Color = SKColors.Black,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 1f,
                IsAntialias = true
            };

            using var paintBlackStroke025pt = new SKPaint
            {
                Color = SKColors.Black,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 0.25f,
                IsAntialias = true
            };

            // Fundo da folha (branco)
            canvas.Clear(SKColors.White);

            using var qrGenerator = new QRCodeGenerator();
            
            // Fonte Typeface para desenhar textos como curvas
            using var typefaceBold = SKTypeface.FromFamilyName("Segoe UI", SKFontStyleWeight.Bold, SKFontStyleWidth.Normal, SKFontStyleSlant.Upright);
            using var typefaceNormal = SKTypeface.FromFamilyName("Segoe UI", SKFontStyleWeight.Normal, SKFontStyleWidth.Normal, SKFontStyleSlant.Upright);

            foreach (var label in labels)
            {
                canvas.Save();

                // Matriz de transformação da etiqueta
                bool labelIsVertical = label.Rotation == 90 || label.Width < label.Height;
                float labelX = (float)label.X * MmToPt;
                float labelY = (float)label.Y * MmToPt;
                float labelW = (float)label.Width * MmToPt;
                float labelH = (float)label.Height * MmToPt;

                if (labelIsVertical)
                {
                    float cx = labelX + labelW / 2f;
                    float cy = labelY + labelH / 2f;
                    canvas.RotateDegrees(90, cx, cy);
                    canvas.Translate(cx - ((float)LabelLayout.NativeWidth * MmToPt) / 2f, cy - ((float)LabelLayout.NativeHeight * MmToPt) / 2f);
                }
                else
                {
                    canvas.Translate(labelX, labelY);
                }

                if (showCropMarks)
                {
                    // Contorno
                    canvas.DrawRect(0, 0, (float)LabelLayout.NativeWidth * MmToPt, (float)LabelLayout.NativeHeight * MmToPt, paintBlackStroke1pt);

                    // Marcas de corte originais transformadas para espaço local
                    // Como elas foram geradas globalmente e transladadas no CanvasImposicao, 
                    // precisaremos desenhá-las fora da transformação local, ou destransformá-las.
                    // Para simplificar, desenhamos iterando na posição global.
                }
                
                // Desenhar conteúdo nativo 90x35
                
                // 1. QR Code
                var qrData = qrGenerator.CreateQrCode(label.Item.QrPayload, QRCodeGenerator.ECCLevel.M);
                var matrix = qrData.ModuleMatrix;
                int count = matrix.Count;
                float qrSizePt = (float)LabelLayout.QrSize * MmToPt;
                float modSize = qrSizePt / count;
                float qrOffsetX = (float)LabelLayout.QrOffsetX * MmToPt;
                float qrOffsetY = (float)LabelLayout.QrOffsetY * MmToPt;

#pragma warning disable CS0618
                using (var qrPath = new SKPath())
                {
                    for (int r = 0; r < count; r++)
                    {
                        var row = matrix[r];
                        for (int c = 0; c < count; c++)
                        {
                            if ((bool)row[c])
                            {
                                float mx = qrOffsetX + c * modSize;
                                float my = qrOffsetY + r * modSize;
                                qrPath.AddRect(new SKRect(mx, my, mx + modSize, my + modSize));
                            }
                        }
                    }
                    canvas.DrawPath(qrPath, paintBlackFill);
                }
#pragma warning restore CS0618

                // 2. Textos em curvas
                float textX = (float)LabelLayout.TextStartX * MmToPt;
                
                DrawTextAsPath(canvas, label.Item.Code, typefaceBold, (float)LabelLayout.CodeFontSize * MmToPt, textX, (float)LabelLayout.CodeY * MmToPt, paintBlackFill);
                DrawTextAsPath(canvas, LabelLayout.Truncate(label.Item.Title, LabelLayout.TitleMaxChars), typefaceBold, (float)LabelLayout.TitleFontSize * MmToPt, textX, (float)LabelLayout.TitleY * MmToPt, paintBlackFill);
                
                float metaY = (float)LabelLayout.SubtitleY * MmToPt;
                if (!string.IsNullOrWhiteSpace(label.Item.Subtitle))
                {
                    DrawTextAsPath(canvas, label.Item.Subtitle, typefaceNormal, (float)LabelLayout.MetaFontSize * MmToPt, textX, metaY, paintBlackFill);
                    metaY += (float)LabelLayout.MetaLineStep * MmToPt;
                }
                if (!string.IsNullOrWhiteSpace(label.Item.Details))
                {
                    DrawTextAsPath(canvas, label.Item.Details, typefaceNormal, (float)LabelLayout.MetaFontSize * MmToPt, textX, metaY, paintBlackFill);
                }

                canvas.Restore();

                // 3. Marcas de Corte Globais (desenhadas sem transformação local, apenas conversão MmToPt)
                if (showCropMarks)
                {
                    foreach (var cm in label.CropMarks)
                    {
                        if (!cm.IsDeleted)
                        {
                            // As CropMarks em CanvasImposicao.cs são armazenadas como coordenadas relativas ao retângulo 90x35 da etiqueta não rotacionada.
                            // Mas espera, nós já as geramos na PlacedLabel relativas a 90x35. 
                            // E no DrawCropMarks da tela elas recebem um "Rect r" para offset.
                            // Vamos resolver a transformação das cropmarks aqui:
                            
                            // StartPointMm é relativo ao 90x35. Precisamos aplicar a mesma transformação!
                            canvas.Save();
                            if (labelIsVertical)
                            {
                                float cx = labelX + labelW / 2f;
                                float cy = labelY + labelH / 2f;
                                canvas.RotateDegrees(90, cx, cy);
                                canvas.Translate(cx - ((float)LabelLayout.NativeWidth * MmToPt) / 2f, cy - ((float)LabelLayout.NativeHeight * MmToPt) / 2f);
                            }
                            else
                            {
                                canvas.Translate(labelX, labelY);
                            }

                            canvas.DrawLine(
                                (float)cm.StartPointMm.X * MmToPt, (float)cm.StartPointMm.Y * MmToPt,
                                (float)cm.EndPointMm.X * MmToPt, (float)cm.EndPointMm.Y * MmToPt,
                                paintBlackStroke025pt
                            );

                            canvas.Restore();
                        }
                    }
                }
            }

            document.EndPage();
            document.Close();
        }

        private static void DrawTextAsPath(SKCanvas canvas, string text, SKTypeface typeface, float size, float x, float y, SKPaint paint)
        {
            if (string.IsNullOrEmpty(text)) return;
            
            using var font = new SKFont(typeface, size);
            font.GetFontMetrics(out SKFontMetrics metrics);
            // 'y' passed is the top coordinate. The baseline is at y - metrics.Ascent (Ascent is negative)
            float baselineY = y - metrics.Ascent;

            using var textPath = font.GetTextPath(text, new SKPoint(x, baselineY));
            canvas.DrawPath(textPath, paint);
        }
    }
}
