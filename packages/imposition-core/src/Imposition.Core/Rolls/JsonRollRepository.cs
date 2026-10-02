using System.Text.Json;

namespace Imposition.Core.Rolls;

/// <summary>
/// Repositório de perfis de rolo persistido localmente em JSON com escrita atômica e tolerância a falhas (ADR-050).
/// Thread-safe.
/// </summary>
public sealed class JsonRollRepository : IRollRepository
{
    private readonly string _filePath;
    private readonly object _lock = new();
    private List<RollSpecification>? _cachedRolls;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public JsonRollRepository(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("Caminho do arquivo não pode ser nulo ou vazio.", nameof(filePath));

        _filePath = filePath;
    }

    public IReadOnlyList<RollSpecification> GetAll()
    {
        lock (_lock)
        {
            EnsureLoaded();
            return _cachedRolls!.AsReadOnly();
        }
    }

    public RollSpecification? GetById(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return null;

        lock (_lock)
        {
            EnsureLoaded();
            return _cachedRolls!.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        }
    }

    public void Save(RollSpecification roll)
    {
        if (roll == null)
            throw new ArgumentNullException(nameof(roll));

        lock (_lock)
        {
            EnsureLoaded();

            var existingIndex = _cachedRolls!.FindIndex(r => string.Equals(r.Id, roll.Id, StringComparison.OrdinalIgnoreCase));
            if (existingIndex >= 0)
            {
                _cachedRolls[existingIndex] = roll;
            }
            else
            {
                _cachedRolls.Add(roll);
            }

            PersistToDisk();
        }
    }

    public void Delete(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return;

        lock (_lock)
        {
            EnsureLoaded();

            var removedCount = _cachedRolls!.RemoveAll(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
            if (removedCount > 0)
            {
                PersistToDisk();
            }
        }
    }

    private void EnsureLoaded()
    {
        if (_cachedRolls != null)
            return;

        if (!File.Exists(_filePath))
        {
            _cachedRolls = new List<RollSpecification>(DefaultRolls.All);
            PersistToDisk();
            return;
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var deserialized = JsonSerializer.Deserialize<List<RollSpecification>>(json, JsonOptions);

            if (deserialized == null || deserialized.Count == 0)
            {
                _cachedRolls = new List<RollSpecification>(DefaultRolls.All);
                return;
            }

            // Filtra apenas entradas válidas
            var validRolls = new List<RollSpecification>();
            foreach (var r in deserialized)
            {
                if (r != null &&
                    !string.IsNullOrWhiteSpace(r.Id) &&
                    double.IsFinite(r.PhysicalWidthMm) && r.PhysicalWidthMm > 0 &&
                    double.IsFinite(r.MarginLeftMm) && r.MarginLeftMm >= 0 &&
                    double.IsFinite(r.MarginRightMm) && r.MarginRightMm >= 0 &&
                    double.IsFinite(r.UsableWidthMm) && r.UsableWidthMm > 0)
                {
                    validRolls.Add(r);
                }
            }

            _cachedRolls = validRolls.Count > 0 ? validRolls : new List<RollSpecification>(DefaultRolls.All);
        }
        catch
        {
            // Em caso de falha de leitura/JSON corrompido, realiza fallback para o catálogo padrão
            _cachedRolls = new List<RollSpecification>(DefaultRolls.All);
        }
    }

    private void PersistToDisk()
    {
        try
        {
            var dir = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var tempFilePath = _filePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            var json = JsonSerializer.Serialize(_cachedRolls, JsonOptions);

            File.WriteAllText(tempFilePath, json);

            // Substituição atômica
            File.Move(tempFilePath, _filePath, overwrite: true);
        }
        catch
        {
            // Falhas de IO de disco não devem quebrar o estado em memória
        }
    }
}
