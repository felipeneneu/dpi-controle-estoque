using System;

namespace GraficaOS.Core
{
    public interface IImposicaoService
    {
        ResultadoProducao Calcular(PdfEntrada pdf, ParametrosRepeticao parametros);
    }

    public class ImposicaoService : IImposicaoService
    {
        public ResultadoProducao Calcular(PdfEntrada pdf, ParametrosRepeticao parametros)
        {
            if (pdf == null) throw new ArgumentNullException(nameof(pdf));
            if (parametros == null) throw new ArgumentNullException(nameof(parametros));

            // Fórmula: TotalCopias = Linhas * Colunas
            int totalCopias = parametros.Linhas * parametros.Colunas;

            // LarguraGrade = Colunas * PagLargura + (Colunas - 1) * Espaco + 2 * Sangria
            double larguraGrade = (parametros.Colunas * pdf.LarguraMm) + 
                                  (Math.Max(0, parametros.Colunas - 1) * parametros.EspacoMm) + 
                                  (2 * parametros.SangriaMm);

            // AlturaGrade = Linhas * PagAltura + (Linhas - 1) * Espaco + 2 * Sangria
            double alturaGrade = (parametros.Linhas * pdf.AlturaMm) + 
                                 (Math.Max(0, parametros.Linhas - 1) * parametros.EspacoMm) + 
                                 (2 * parametros.SangriaMm);

            return new ResultadoProducao
            {
                TotalCopias = totalCopias,
                LarguraGradeMm = Math.Round(larguraGrade, 2),
                AlturaGradeMm = Math.Round(alturaGrade, 2)
            };
        }
    }

    public interface IPdfImportService
    {
        PdfEntrada ExtrairInfo(string filePath);
    }

    // Dummy implementation for now to compile
    public class MockPdfImportService : IPdfImportService
    {
        public PdfEntrada ExtrairInfo(string filePath)
        {
            return new PdfEntrada
            {
                Caminho = filePath,
                LarguraMm = 210.0,
                AlturaMm = 297.0,
                Paginas = 1
            };
        }
    }
}
