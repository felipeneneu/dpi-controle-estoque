using System.Collections.Generic;
using System.Threading.Tasks;
using ImpositorKonica.Models;

namespace ImpositorKonica.Services
{
    public interface IFileDialogService
    {
        string? OpenPdfFile();
        string? OpenAnyFile();
    }

    public interface IPdfImportService
    {
        Task<PdfPageInfo> LoadPdfAsync(string filePath);
    }

    public interface IImpositionService
    {
        PdfRepetitionResult CalculateImposition(PdfPageInfo page, int rows, int columns, double gutterMm, double bleedMm);
    }

    public interface IRecentFilesRepository
    {
        Task<IEnumerable<RecentFile>> GetRecentFilesAsync();
    }

    public interface IUserStateStore
    {
        string? GetLastUsedPath();
        void SaveLastUsedPath(string path);
    }
    
    // Mock implementations
    public class MockFileDialogService : IFileDialogService
    {
        public string? OpenPdfFile() => "C:\\Fake\\Path\\mock_file.pdf";
        public string? OpenAnyFile() => "C:\\Fake\\Path\\documento.ai";
    }
    
    public class MockPdfImportService : IPdfImportService
    {
        public async Task<PdfPageInfo> LoadPdfAsync(string filePath)
        {
            await Task.Delay(500); // simulate IO
            return new PdfPageInfo { WidthMm = 210, HeightMm = 297, PageCount = 1 }; // A4
        }
    }
    
    public class ImpositionService : IImpositionService
    {
        public PdfRepetitionResult CalculateImposition(PdfPageInfo page, int rows, int columns, double gutterMm, double bleedMm)
        {
            int totalCopies = rows * columns;
            double layoutW = (page.WidthMm * columns) + (gutterMm * (columns > 1 ? columns - 1 : 0)) + (bleedMm * 2);
            double layoutH = (page.HeightMm * rows) + (gutterMm * (rows > 1 ? rows - 1 : 0)) + (bleedMm * 2);
            
            return new PdfRepetitionResult
            {
                TotalCopies = totalCopies,
                LayoutWidth = layoutW,
                LayoutHeight = layoutH
            };
        }
    }
    
    public class MockRecentFilesRepository : IRecentFilesRepository
    {
        public async Task<IEnumerable<RecentFile>> GetRecentFilesAsync()
        {
            await Task.Delay(100);
            return new List<RecentFile>
            {
                new RecentFile { FileName = "Cartao_Visita.pdf", FileType = "PDF", Location = "No seu computador" },
                new RecentFile { FileName = "Banner_Promocao.ai", FileType = "AI", Location = "Creative Cloud" },
                new RecentFile { FileName = "Adesivo.png", FileType = "PNG", Location = "No seu computador" }
            };
        }
    }
}
