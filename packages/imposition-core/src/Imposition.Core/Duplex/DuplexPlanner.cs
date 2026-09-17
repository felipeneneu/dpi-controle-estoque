using System.Security.Cryptography;
using System.Text;
using Imposition.Core.Contracts;
using Imposition.Core.Geometry;
using Imposition.Core.Grid;

namespace Imposition.Core.Duplex;

/// <summary>
/// Wrapper de duplex — ADR-022. Chama o core uma vez para a frente e
/// deriva o verso por transformação determinística. Nenhum renderer
/// implementa espelhamento (Regra 5).
/// </summary>
public static class DuplexPlanner
{
    public static DuplexPlan Plan(DuplexRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var front = GridSearchEngine.Plan(request.FrontInput);
        var back  = DeriveBack(front, request, request.FrontInput);

        var gridHash = CombineHash(front.GridHash, request.Pairing);

        return new DuplexPlan(front, back, request.Pairing, gridHash);
    }

    private static ImpositionResult DeriveBack(
        ImpositionResult front,
        DuplexRequest request,
        ImpositionInput input)
    {
        var substrateH = input.Substrate.Kind == SubstrateKind.Roll
            ? front.LengthMm
            : input.Substrate.InitialLengthMm;

        var backPlacements = front.Placements
            .Select(p => Transform(p, request.Pairing, substrateH))
            .ToArray();

        return front with
        {
            Placements   = backPlacements,
            Orientation  = front.Orientation,
        };
    }

    private static Placement Transform(
        Placement p, DuplexPairing pairing, double substrateH)
        => pairing switch
        {
            // Topo-frente ↔ topo-verso. Mesma posição, mesma rotação.
            DuplexPairing.HeadToHead => p,

            // Topo-frente ↔ base-verso. Espelha Y.
            DuplexPairing.HeadToFoot => p with
            {
                YMm = substrateH - p.YMm - p.HeightMm,
            },

            _ => throw new ArgumentOutOfRangeException(nameof(pairing)),
        };

    private static string CombineHash(string frontHash, DuplexPairing pairing)
    {
        var payload = $"{frontHash}|{pairing}";
        return Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }
}
