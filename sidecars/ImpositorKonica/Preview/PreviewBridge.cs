using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media.Imaging;
using Imposition.Core.Contracts;
using ImpositorKonica.Models;
using ImpositorKonica.Views;

namespace ImpositorKonica.Preview
{
    internal static class PreviewBridge
    {
        public static void ShowReadOnlyWindow(ImpositionInput input, ImpositionResult result, BitmapSource? thumbnail)
        {
            var window = new Window
            {
                Title = $"Preview Nativo - {result.Cols}x{result.Rows} = {result.PlannedUnits} unidades",
                Width = 1000,
                Height = 800,
                WindowStartupLocation = WindowStartupLocation.CenterScreen
            };

            var canvas = new CanvasImposicao
            {
                SheetWidthMm = input.Substrate.WidthMm,
                SheetHeightMm = result.LengthMm,
                MarginMm = input.Margin.LeftMm, // Approximating margin since CanvasImposicao uses single MarginMm
                GapMm = input.Gap.HorizontalMm, // Approximating since CanvasImposicao uses single GapMm
                ActiveRotation = result.Orientation == Imposition.Core.Geometry.Orientation.Portrait ? 0 : 90,
                IsEnabled = false // Disable interaction for read-only preview
            };

            // Map result to canvas labels
            var itemDto = new ImpositionItemDto
            {
                Id = "preview",
                Code = "PREVIEW",
                Title = $"{input.Piece.WidthMm}x{input.Piece.HeightMm} mm",
                // ImpositionItemDto hardcodes the dimension inside PlacedLabel in this project
            };

            // Calculate label dimensions based on orientation
            double labelW = result.Orientation == Imposition.Core.Geometry.Orientation.Portrait ? input.Piece.WidthMm : input.Piece.HeightMm;
            double labelH = result.Orientation == Imposition.Core.Geometry.Orientation.Portrait ? input.Piece.HeightMm : input.Piece.WidthMm;

            int unitsPlaced = 0;
            double currentY = input.Margin.TopMm;

            var labelsToLoad = new List<PlacedLabel>();

            for (int r = 0; r < result.Rows; r++)
            {
                double currentX = input.Margin.LeftMm;
                for (int c = 0; c < result.Cols; c++)
                {
                    if (unitsPlaced >= result.PlannedUnits)
                        break;

                    var label = new PlacedLabel(itemDto, currentX, currentY, labelW, labelH, canvas.ActiveRotation);
                    
                    // Force the actual requested size, bypassing the hardcoded 90x35 in PlacedLabel's constructor
                    label.Width = labelW;
                    label.Height = labelH;

                    labelsToLoad.Add(label);
                    
                    unitsPlaced++;
                    currentX += labelW + input.Gap.HorizontalMm;
                }
                currentY += labelH + input.Gap.VerticalMm;
            }

            canvas.LoadPreviewLabels(labelsToLoad, thumbnail);

            window.Content = canvas;
            window.ShowDialog();
        }
    }
}
