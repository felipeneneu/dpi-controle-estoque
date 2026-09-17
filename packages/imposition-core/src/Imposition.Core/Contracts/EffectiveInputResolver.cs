namespace Imposition.Core.Contracts;

/// <summary>
/// Resolver de precedência — ADR-021 §Decisão 4.
///
/// Precedência: chamada (1) > preset (2) > MachineProfile (3) >
///              system default (4).
///
/// Em PR #1, apenas a camada 4 é implementada e o merge é "primeiro
/// não-nulo vence". O merge campo-a-campo com nullables chega nos
/// PRs #2/#3 (MachineProfile e presets) SEM alterar este contrato
/// público — o resolver permanece função pura.
/// </summary>
public static class EffectiveInputResolver
{
    /// <summary>
    /// Retorna o <see cref="ImpositionInput"/> de maior precedência
    /// que foi fornecido. Se todas as camadas forem <c>null</c>,
    /// retorna <see cref="SystemDefaults.Value"/> (camada 4).
    /// </summary>
    public static ImpositionInput Resolve(
        ImpositionInput? fromCall,
        ImpositionInput? fromPreset,
        ImpositionInput? fromProfile)
        => fromCall
        ?? fromPreset
        ?? fromProfile
        ?? SystemDefaults.Value;
}
