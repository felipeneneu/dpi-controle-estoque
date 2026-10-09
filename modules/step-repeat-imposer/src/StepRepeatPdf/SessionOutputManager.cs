namespace StepRepeatPdf;

public record SessionDirectories(
    string SessionRoot,
    string AcDir,
    string DesenvolvimentoDir,
    string SaidaDir,
    string OriginalCopiedPath,
    string PretreatedPdfPath,
    string ImposedPdfPath
);

/// <summary>
/// Gerenciador de Estrutura de Pastas de Exportação da Sessão de Imposição.
/// Cria a estrutura padronizada com Timestamp:
/// - AC/ (Arquivo Original do Cliente)
/// - Desenvolvimento/ (Arquivo Pré-Tratado Limpo Sem Marcas do Cliente)
/// - Saida/ (Imposição Final Step & Repeat com SmartMarks)
/// </summary>
public static class SessionOutputManager
{
    public static SessionDirectories PrepareSessionDirectories(
        string baseOutputDir,
        string? inputPdfPath,
        DateTime sessionTimestamp)
    {
        string timestampStr = sessionTimestamp.ToString("yyyyMMdd_HHmmss");
        string sessionFolderName = $"JOB_{timestampStr}";
        string sessionRoot = Path.Combine(baseOutputDir, sessionFolderName);

        string acDir = Path.Combine(sessionRoot, "AC");
        string devDir = Path.Combine(sessionRoot, "Desenvolvimento");
        string saidaDir = Path.Combine(sessionRoot, "Saida");

        Directory.CreateDirectory(acDir);
        Directory.CreateDirectory(devDir);
        Directory.CreateDirectory(saidaDir);

        string copiedOriginalPath = Path.Combine(acDir, "arquivo_original.pdf");
        if (!string.IsNullOrEmpty(inputPdfPath) && File.Exists(inputPdfPath))
        {
            File.Copy(inputPdfPath, copiedOriginalPath, overwrite: true);
        }

        string pretreatedPath = Path.Combine(devDir, "pretratado_sem_marcas.pdf");
        string outputImposedPath = Path.Combine(saidaDir, "imposicao_step_repeat.pdf");

        return new SessionDirectories(
            SessionRoot: sessionRoot,
            AcDir: acDir,
            DesenvolvimentoDir: devDir,
            SaidaDir: saidaDir,
            OriginalCopiedPath: copiedOriginalPath,
            PretreatedPdfPath: pretreatedPath,
            ImposedPdfPath: outputImposedPath
        );
    }
}
