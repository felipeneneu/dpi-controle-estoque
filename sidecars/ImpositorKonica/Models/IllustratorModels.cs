using System;

namespace ImpositorKonica.Models
{
    public class RecentFile
    {
        public string FilePath { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty; // AI, PDF, PNG
        public DateTime LastOpened { get; set; }
        public string Location { get; set; } = "No seu computador";
    }

    public class PdfRepetitionResult
    {
        public int TotalCopies { get; set; }
        public double LayoutWidth { get; set; }
        public double LayoutHeight { get; set; }
    }

    public class PdfPageInfo
    {
        public double WidthMm { get; set; }
        public double HeightMm { get; set; }
        public int PageCount { get; set; }
    }
}
