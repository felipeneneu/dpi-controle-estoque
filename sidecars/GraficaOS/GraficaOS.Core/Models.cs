namespace GraficaOS.Core
{
    public class PdfEntrada
    {
        public string Caminho { get; set; } = string.Empty;
        public double LarguraMm { get; set; }
        public double AlturaMm { get; set; }
        public int Paginas { get; set; }
    }

    public class ParametrosRepeticao
    {
        public int Linhas { get; set; } = 1;
        public int Colunas { get; set; } = 1;
        public double EspacoMm { get; set; }
        public double SangriaMm { get; set; }
    }

    public class ResultadoProducao
    {
        public int TotalCopias { get; set; }
        public double LarguraGradeMm { get; set; }
        public double AlturaGradeMm { get; set; }
    }

    public class ImposicaoExecucao
    {
        public string Execucao { get; set; } = string.Empty;
        public string EstiloTrabalho { get; set; } = "Sheetwise";
        public string Secoes { get; set; } = string.Empty;
        public string EtapaRepeticoes { get; set; } = string.Empty;
        public string Cores { get; set; } = string.Empty;
        public string Bloco { get; set; } = string.Empty;
        public string Midia { get; set; } = string.Empty;
        public string Modelo { get; set; } = string.Empty;
        public string Assinatura { get; set; } = string.Empty;
        public double ComprimentoMm { get; set; }
    }
}
