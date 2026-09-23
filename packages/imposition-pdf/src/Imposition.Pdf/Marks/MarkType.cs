namespace Imposition.Pdf.Marks;

public enum MarkType
{
    /// <summary>L-shape preta pura (sem spot). Geometria teste 1.</summary>
    MimakiTipo1Plain,

    /// <summary>L-shape pintada com spot /MimakiFCRM (teste 2).</summary>
    MimakiTipo1Fcrm,

    /// <summary>FCRM + fundo /RDG_WHITE (papel escuro — teste 3).</summary>
    MimakiTipo1FcrmRdg,

    /// <summary>L-shape preta pura para Konica (crop marks).</summary>
    Crop,

    /// <summary>Marca customizada injetada de um PDF externo.</summary>
    CustomPdf,
}
