using System.IO;
using Imposition.Render.Native;

namespace SeamsCLI.Tests.Fixtures;

public static class RuntimeFixtures
{
    public static void CreateJpgCmyk(string filePath, int widthPx = 200, int heightPx = 200, int dpi = 150)
    {
        var buffer = new byte[widthPx * heightPx * 4];
        for (int i = 0; i < buffer.Length; i += 4)
        {
            buffer[i] = 100;     // C
            buffer[i + 1] = 50;  // M
            buffer[i + 2] = 0;   // Y
            buffer[i + 3] = 20;  // K
        }

        using var fs = File.Create(filePath);
        LibJpegTurboNative.EncodeCmyk(buffer, widthPx, heightPx, quality: 100, output: fs, dpi: dpi);
    }

    public static void CreatePdfCmyk(string filePath, double widthPt = 5669.29, double heightPt = 2834.65)
    {
        var content =
            "%PDF-1.3\n" +
            "%%Comment: QDF 1.0\n" +
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
            $"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {widthPt:F2} {heightPt:F2}] /Contents 4 0 R >> endobj\n" +
            "4 0 obj << /Length 22 >> stream\n0 0 0 1 k 0 0 10 10 re f\nendstream endobj\n" +
            "xref\n0 5\n0000000000 65535 f \n0000000030 00000 n \n0000000080 00000 n \n0000000140 00000 n \n0000000250 00000 n \n" +
            "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF\n";

        File.WriteAllText(filePath, content);
    }
}
