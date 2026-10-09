namespace StepRepeatEngine.Geometry;

/// <summary>
/// Resolvedor de coordenadas para o sistema de SmartMarks de 9 pontos.
/// Calcula a posição exata da marca em relação a um retângulo alvo.
/// </summary>
public static class AnchorResolver
{
    /// <summary>
    /// Calcula a posição final (Rect2D) de uma marca alinhada a um retângulo alvo.
    /// </summary>
    /// <param name="targetRect">O retângulo da entidade alvo (Folha, Margem, Calha ou Item).</param>
    /// <param name="markWidth">Largura da marca em mm.</param>
    /// <param name="markHeight">Altura da marca em mm.</param>
    /// <param name="targetAnchor">Ponto de ancoragem na entidade alvo.</param>
    /// <param name="markAnchor">Ponto de ancoragem correspondente na marca.</param>
    /// <param name="offsetX">Deslocamento adicional X em mm.</param>
    /// <param name="offsetY">Deslocamento adicional Y em mm.</param>
    /// <returns>O Rect2D delimitador da marca posicionada.</returns>
    public static Rect2D Resolve(
        Rect2D targetRect,
        double markWidth,
        double markHeight,
        AnchorPoint targetAnchor,
        AnchorPoint markAnchor,
        double offsetX = 0.0,
        double offsetY = 0.0)
    {
        if (!double.IsFinite(markWidth) || markWidth < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(markWidth), "A largura da marca deve ser finita e não-negativa.");
        }

        if (!double.IsFinite(markHeight) || markHeight < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(markHeight), "A altura da marca deve ser finita e não-negativa.");
        }

        if (!double.IsFinite(offsetX) || !double.IsFinite(offsetY))
        {
            throw new ArgumentException("Os offsets X e Y devem ser números finitos válidos.");
        }

        // Pega as coordenadas X, Y do ponto de ancoragem no alvo
        var (targetX, targetY) = targetRect.GetAnchorCoordinates(targetAnchor);

        // Cria um retângulo de teste na origem (0,0) para descobrir o offset relativo do ponto de ancoragem da marca
        var dummyMarkRect = new Rect2D(0, 0, markWidth, markHeight);
        var (markAnchorX, markAnchorY) = dummyMarkRect.GetAnchorCoordinates(markAnchor);

        // O canto inferior esquerdo (X, Y) da marca é posicionado de forma que markAnchor coincida com targetAnchor + offsets
        double finalX = targetX - markAnchorX + offsetX;
        double finalY = targetY - markAnchorY + offsetY;

        return new Rect2D(finalX, finalY, markWidth, markHeight);
    }
}
