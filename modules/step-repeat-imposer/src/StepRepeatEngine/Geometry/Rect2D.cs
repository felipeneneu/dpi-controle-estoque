namespace StepRepeatEngine.Geometry;

/// <summary>
/// Representa um retângulo 2D em milímetros para cálculo geométrico de imposição.
/// </summary>
public readonly record struct Rect2D
{
    public double X { get; }
    public double Y { get; }
    public double Width { get; }
    public double Height { get; }

    public double Left => X;
    public double Right => X + Width;
    public double Top => Y + Height;
    public double Bottom => Y;
    public double CenterX => X + (Width / 2.0);
    public double CenterY => Y + (Height / 2.0);

    public Rect2D(double x, double y, double width, double height)
    {
        if (!double.IsFinite(x) || !double.IsFinite(y))
        {
            throw new ArgumentException("As coordenadas X e Y devem ser números finitos válidos.");
        }

        if (!double.IsFinite(width) || width < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width), "A largura deve ser um número finito não-negativo.");
        }

        if (!double.IsFinite(height) || height < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(height), "A altura deve ser um número finito não-negativo.");
        }

        X = x;
        Y = y;
        Width = width;
        Height = height;
    }

    /// <summary>
    /// Retorna as coordenadas X, Y de um ponto de ancoragem na grade 3x3 deste retângulo.
    /// </summary>
    public (double X, double Y) GetAnchorCoordinates(AnchorPoint anchor)
    {
        return anchor switch
        {
            AnchorPoint.TopLeft => (Left, Top),
            AnchorPoint.TopCenter => (CenterX, Top),
            AnchorPoint.TopRight => (Right, Top),
            AnchorPoint.MidLeft => (Left, CenterY),
            AnchorPoint.Center => (CenterX, CenterY),
            AnchorPoint.MidRight => (Right, CenterY),
            AnchorPoint.BottomLeft => (Left, Bottom),
            AnchorPoint.BottomCenter => (CenterX, Bottom),
            AnchorPoint.BottomRight => (Right, Bottom),
            _ => throw new ArgumentOutOfRangeException(nameof(anchor), anchor, "Ponto de ancoragem desconhecido.")
        };
    }
}
