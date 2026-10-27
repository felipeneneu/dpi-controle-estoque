using System.Text.Json;

namespace GraficaOS.Engine;

/// <summary>
/// Lê configuração do tenant a partir de %ProgramData%\GraficaOS\tenant.json.
/// Cache em memória por 60 segundos. Nunca lança exceção — retorna config
/// "unknown" se o arquivo não existir.
/// </summary>
public sealed class TenantConfig
{
    private static readonly string TenantFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "GraficaOS",
        "tenant.json");

    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(60);

    private TenantInfo? _cached;
    private DateTimeOffset _cachedAt = DateTimeOffset.MinValue;
    private readonly object _lock = new();

    /// <summary>Retorna informações do tenant ativo (com cache de 60s).</summary>
    public TenantInfo GetTenant()
    {
        lock (_lock)
        {
            if (_cached is not null && DateTimeOffset.UtcNow - _cachedAt < CacheDuration)
                return _cached;

            _cached = LoadFromDisk();
            _cachedAt = DateTimeOffset.UtcNow;
            return _cached;
        }
    }

    /// <summary>Invalida o cache forçando releitura no próximo acesso.</summary>
    public void InvalidateCache()
    {
        lock (_lock)
        {
            _cached = null;
            _cachedAt = DateTimeOffset.MinValue;
        }
    }

    private static TenantInfo LoadFromDisk()
    {
        try
        {
            if (!File.Exists(TenantFilePath))
                return TenantInfo.Unknown;

            var json = File.ReadAllText(TenantFilePath);
            var tenant = JsonSerializer.Deserialize<TenantInfo>(json, JsonDefaults.Options);
            return tenant ?? TenantInfo.Unknown;
        }
        catch
        {
            // Nunca lança exceção — retorna config desconhecida
            return TenantInfo.Unknown;
        }
    }
}

/// <summary>Informações do tenant lidas de tenant.json.</summary>
public sealed record TenantInfo(
    string SchemaVersion,
    string TenantId,
    string TenantName,
    DateTimeOffset InstalledAt,
    string MachineId,
    IReadOnlyList<string> Features)
{
    /// <summary>Tenant padrão quando o arquivo não existe ou é inválido.</summary>
    public static readonly TenantInfo Unknown = new(
        SchemaVersion: "1.0",
        TenantId: "unknown",
        TenantName: "Não configurado",
        InstalledAt: DateTimeOffset.MinValue,
        MachineId: Environment.MachineName,
        Features: []);
}
