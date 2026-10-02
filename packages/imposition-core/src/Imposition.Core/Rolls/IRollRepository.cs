namespace Imposition.Core.Rolls;

/// <summary>
/// Contrato de repositório de perfis de rolos de substrato (ADR-050).
/// </summary>
public interface IRollRepository
{
    /// <summary>Retorna todos os rolos cadastrados.</summary>
    IReadOnlyList<RollSpecification> GetAll();

    /// <summary>Busca um rolo pelo seu identificador único.</summary>
    RollSpecification? GetById(string id);

    /// <summary>Salva ou atualiza um perfil de rolo.</summary>
    void Save(RollSpecification roll);

    /// <summary>Remove um perfil de rolo pelo ID.</summary>
    void Delete(string id);
}
