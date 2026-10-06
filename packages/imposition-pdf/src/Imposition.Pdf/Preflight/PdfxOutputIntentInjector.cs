using System.Buffers.Binary;
using System.Text;
using System.Text.RegularExpressions;
using Imposition.Core.Errors;

namespace Imposition.Pdf.Preflight;

/// <summary>
/// Injeta o dicionário de OutputIntent (GTS_PDFX) com perfil ICC embutido via Incremental Update (ADR-054, BR-055).
/// </summary>
public static class PdfxOutputIntentInjector
{
    private static readonly Encoding Latin1 = Encoding.GetEncoding(28591);

    /// <summary>
    /// Injeta o OutputIntent PDF/X-1a no PDF especificado.
    /// Valida o cabeçalho ICC antes de qualquer operação.
    /// </summary>
    public static void Inject(string pdfPath, PdfxOutputIntent intent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pdfPath);
        ArgumentNullException.ThrowIfNull(intent);

        if (!File.Exists(pdfPath))
            throw new FileNotFoundException("PDF não encontrado para injeção de OutputIntent.", pdfPath);

        ValidateIccProfile(intent.IccProfileBytes);

        var fileBytes = File.ReadAllBytes(pdfPath);
        var content = Latin1.GetString(fileBytes);

        // Idempotência: não duplica se já possuir OutputIntent GTS_PDFX
        if (content.Contains("/OutputIntents") && content.Contains("/GTS_PDFX"))
        {
            return;
        }

        // 1. Localiza a raiz do catálogo (/Root)
        var catalogObjMatch = Regex.Match(content, @"(\d+)\s+0\s+obj[\s\S]*?\/Type\s*\/Catalog[\s\S]*?endobj");
        if (!catalogObjMatch.Success)
        {
            // Tenta procurar via trailer /Root <num> 0 R
            var trailerRootMatch = Regex.Match(content, @"\/Root\s+(\d+)\s+0\s+R");
            if (trailerRootMatch.Success)
            {
                var rootNum = trailerRootMatch.Groups[1].Value;
                catalogObjMatch = Regex.Match(content, $@"{rootNum}\s+0\s+obj[\s\S]*?endobj");
            }
        }

        if (!catalogObjMatch.Success)
        {
            throw new InvalidOperationException("Não foi possível localizar o objeto /Catalog no PDF.");
        }

        var catalogObjText = catalogObjMatch.Value;
        var catalogObjNum = int.Parse(Regex.Match(catalogObjText, @"^(\d+)\s+0\s+obj").Groups[1].Value);

        // 2. Localiza startxref anterior
        var startXrefMatch = Regex.Match(content, @"startxref\s+(\d+)\s+%%EOF", RegexOptions.RightToLeft);
        long prevXrefOffset = startXrefMatch.Success ? long.Parse(startXrefMatch.Groups[1].Value) : 0;

        // 3. Determina o maior ID de objeto no arquivo existente
        var allObjMatches = Regex.Matches(content, @"\b(\d+)\s+0\s+obj\b");
        int maxObjId = 0;
        foreach (Match m in allObjMatches)
        {
            if (int.TryParse(m.Groups[1].Value, out var id) && id > maxObjId)
                maxObjId = id;
        }

        int iccObjNum = maxObjId + 1;
        int intentObjNum = maxObjId + 2;
        int newObjCount = maxObjId + 3;

        // 4. Constrói o corpo do novo catálogo contendo /OutputIntents
        string updatedCatalogDict;
        var dictBodyMatch = Regex.Match(catalogObjText, @"<<([\s\S]*?)>>");
        if (dictBodyMatch.Success)
        {
            var dictBody = dictBodyMatch.Groups[1].Value.TrimEnd();
            updatedCatalogDict = $"<<\n{dictBody}\n  /OutputIntents [ {intentObjNum} 0 R ]\n>>";
        }
        else
        {
            updatedCatalogDict = $"<<\n  /Type /Catalog\n  /OutputIntents [ {intentObjNum} 0 R ]\n>>";
        }

        // 5. Monta a seção incremental
        var incrementalSb = new StringBuilder();
        var newOffsets = new Dictionary<int, long>();

        long currentOffset = fileBytes.Length;
        incrementalSb.Append("\n");
        currentOffset += Latin1.GetByteCount("\n");

        // Objeto 1: Stream do ICC
        newOffsets[iccObjNum] = currentOffset;
        var iccStreamHeader = $"{iccObjNum} 0 obj\n<<\n  /N 4\n  /Length {intent.IccProfileBytes.Length}\n>>\nstream\n";
        incrementalSb.Append(iccStreamHeader);
        currentOffset += Latin1.GetByteCount(iccStreamHeader);

        // Adiciona dados brutos do stream ICC
        var iccStreamData = Latin1.GetString(intent.IccProfileBytes);
        incrementalSb.Append(iccStreamData);
        currentOffset += intent.IccProfileBytes.Length;

        var iccStreamFooter = "\nendstream\nendobj\n";
        incrementalSb.Append(iccStreamFooter);
        currentOffset += Latin1.GetByteCount(iccStreamFooter);

        // Objeto 2: Dicionário OutputIntent
        newOffsets[intentObjNum] = currentOffset;
        var intentText = $"{intentObjNum} 0 obj\n<<\n  /Type /OutputIntent\n  /S /GTS_PDFX\n  /OutputConditionIdentifier ({intent.OutputConditionIdentifier})\n  /Info ({intent.Info})\n  /DestOutputProfile {iccObjNum} 0 R\n>>\nendobj\n";
        incrementalSb.Append(intentText);
        currentOffset += Latin1.GetByteCount(intentText);

        // Objeto 3: Catálogo Atualizado
        newOffsets[catalogObjNum] = currentOffset;
        var catalogText = $"{catalogObjNum} 0 obj\n{updatedCatalogDict}\nendobj\n";
        incrementalSb.Append(catalogText);
        currentOffset += Latin1.GetByteCount(catalogText);

        // Tabela Xref Incremental
        long xrefOffset = currentOffset;
        incrementalSb.AppendLine("xref");

        // Atualização do Catálogo
        incrementalSb.AppendLine($"{catalogObjNum} 1");
        incrementalSb.AppendLine($"{newOffsets[catalogObjNum]:D10} 00000 n ");

        // Novos objetos ICC e OutputIntent
        incrementalSb.AppendLine($"{iccObjNum} 2");
        incrementalSb.AppendLine($"{newOffsets[iccObjNum]:D10} 00000 n ");
        incrementalSb.AppendLine($"{newOffsets[intentObjNum]:D10} 00000 n ");

        // Trailer
        incrementalSb.AppendLine("trailer");
        incrementalSb.AppendLine("<<");
        incrementalSb.AppendLine($"  /Root {catalogObjNum} 0 R");
        incrementalSb.AppendLine($"  /Size {newObjCount}");
        if (prevXrefOffset > 0)
        {
            incrementalSb.AppendLine($"  /Prev {prevXrefOffset}");
        }
        incrementalSb.AppendLine(">>");
        incrementalSb.AppendLine("startxref");
        incrementalSb.AppendLine(xrefOffset.ToString());
        incrementalSb.AppendLine("%%EOF");

        // Grava no arquivo via append atômico
        using (var fs = new FileStream(pdfPath, FileMode.Append, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(fs, Latin1))
        {
            writer.Write(incrementalSb.ToString());
        }
    }

    private static void ValidateIccProfile(byte[]? iccBytes)
    {
        if (iccBytes == null || iccBytes.Length < 128)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidIccProfile,
                "Perfil ICC inválido: buffer nulo ou menor que o cabeçalho mínimo obrigatório de 128 bytes.");
        }

        var declaredSize = BinaryPrimitives.ReadUInt32BigEndian(iccBytes.AsSpan(0, 4));
        if (declaredSize < 128 || iccBytes.Length < (int)declaredSize)
        {
            throw new ImpositionException(
                ErrorCodes.InvalidIccProfile,
                $"Perfil ICC truncado ou inconsistente: tamanho declarado ({declaredSize} bytes) excede os bytes disponíveis ({iccBytes.Length} bytes).");
        }

        // Assinatura 'acsp' nos bytes 36–39 (0x61, 0x63, 0x73, 0x70)
        if (iccBytes[36] != (byte)'a' ||
            iccBytes[37] != (byte)'c' ||
            iccBytes[38] != (byte)'s' ||
            iccBytes[39] != (byte)'p')
        {
            throw new ImpositionException(
                ErrorCodes.InvalidIccProfile,
                "Perfil ICC inválido: assinatura mágica 'acsp' ausente nos offsets 36-39.");
        }
    }
}
