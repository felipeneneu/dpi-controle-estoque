using System;
using System.IO;
using System.Drawing;
using System.Windows.Media.Imaging;
using PdfiumViewer;

namespace ImpositorKonica.Preview
{
    /// <summary>
    /// Renderiza a primeira página do PDF de entrada como miniatura.
    /// Cacheia resultado por (sourcePath, dpi).
    /// </summary>
    internal sealed class PdfPageRenderer : IDisposable
    {
        private readonly string _sourcePath;
        private readonly int _dpi;
        private BitmapSource? _cached;

        public PdfPageRenderer(string sourcePath, int dpi = 150)
        {
            _sourcePath = sourcePath;
            _dpi = dpi;
        }

        public BitmapSource GetPieceThumbnail()
        {
            if (_cached is not null) return _cached;

            using var doc = PdfDocument.Load(_sourcePath);
            using var page = doc.Render(0, _dpi, _dpi, PdfRenderFlags.Annotations);

            _cached = ConvertToBitmapSource(page);
            _cached.Freeze(); // thread-safe + perf
            return _cached;
        }

        private static BitmapSource ConvertToBitmapSource(Image img)
        {
            using var ms = new MemoryStream();
            img.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            ms.Position = 0;

            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.StreamSource = ms;
            bmp.EndInit();
            return bmp;
        }

        public void Dispose() { /* PdfiumViewer limpa native resources automaticamente em seus objetos */ }
    }
}
