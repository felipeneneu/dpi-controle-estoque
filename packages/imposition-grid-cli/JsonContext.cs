using System.Text.Json.Serialization;
using Imposition.Core.Contracts;
using Imposition.Core.Duplex;

namespace Imposition.GridCli;

/// <summary>
/// Source-gen context para AOT/trimming — elimina IL2026/IL3050.
/// Cada tipo serializado em stdout precisa estar registrado aqui.
/// </summary>
[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ImpositionResult))]
[JsonSerializable(typeof(DuplexPlan))]
[JsonSerializable(typeof(ErrorResponse))]
internal partial class JsonContext : JsonSerializerContext
{
}

/// <summary>Envelope de erro — sempre serializado em stderr.</summary>
internal sealed record ErrorResponse(ErrorPayload Error);
internal sealed record ErrorPayload(string Code, string Message);