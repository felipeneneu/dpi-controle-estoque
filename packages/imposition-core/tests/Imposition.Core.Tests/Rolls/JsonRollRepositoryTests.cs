using Imposition.Core.Rolls;
using Xunit;

namespace Imposition.Core.Tests.Rolls;

[Trait("Category", "Rolls")]
[Trait("Category", "Seams")]
public sealed class JsonRollRepositoryTests : IDisposable
{
    private readonly string _tempDirectory;
    private readonly string _testFilePath;

    public JsonRollRepositoryTests()
    {
        _tempDirectory = Path.Combine(Path.GetTempPath(), "GraficaOS_Test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDirectory);
        _testFilePath = Path.Combine(_tempDirectory, "rolls.json");
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDirectory))
                Directory.Delete(_tempDirectory, recursive: true);
        }
        catch
        {
            // Ignora falhas de cleanup em ambiente de teste temporário
        }
    }

    [Fact]
    public void BR_051_NewFile_ReturnsDefaultCatalog()
    {
        var repo = new JsonRollRepository(_testFilePath);

        var rolls = repo.GetAll();

        Assert.Equal(DefaultRolls.All.Count, rolls.Count);
        Assert.Contains(rolls, r => r.Id == "roll-1520");
    }

    [Fact]
    public void BR_051_SaveNewRoll_GetByIdReturnsSavedRoll()
    {
        var repo = new JsonRollRepository(_testFilePath);
        var custom = RollSpecification.Create("custom-1800", "Lona 1,80m", 1800.0, 20.0);

        repo.Save(custom);

        var retrieved = repo.GetById("custom-1800");
        Assert.NotNull(retrieved);
        Assert.Equal("Lona 1,80m", retrieved.Name);
        Assert.Equal(1800.0, retrieved.PhysicalWidthMm);
        Assert.Equal(1760.0, retrieved.UsableWidthMm);
    }

    [Fact]
    public void BR_051_SaveSameId_OverwritesAndDoesNotDuplicate()
    {
        var repo = new JsonRollRepository(_testFilePath);
        var initialCount = repo.GetAll().Count;

        var modified = RollSpecification.Create("roll-1520", "Lona 1,52m Calibrada", 1520.0, 25.0);
        repo.Save(modified);

        var all = repo.GetAll();
        Assert.Equal(initialCount, all.Count);
        var retrieved = repo.GetById("roll-1520");
        Assert.NotNull(retrieved);
        Assert.Equal("Lona 1,52m Calibrada", retrieved.Name);
        Assert.Equal(1470.0, retrieved.UsableWidthMm);
    }

    [Fact]
    public void BR_051_DeleteExisting_RemovesFromCatalog()
    {
        var repo = new JsonRollRepository(_testFilePath);

        repo.Delete("roll-910");

        var all = repo.GetAll();
        Assert.DoesNotContain(all, r => r.Id == "roll-910");
        Assert.Null(repo.GetById("roll-910"));
    }

    [Fact]
    public void BR_051_DeleteNonExisting_DoesNotThrow()
    {
        var repo = new JsonRollRepository(_testFilePath);

        // Deve executar sem lançar exceção
        repo.Delete("non-existing-id");
    }

    [Fact]
    public void BR_051_MalformedJsonFile_ReturnsDefaultCatalog()
    {
        File.WriteAllText(_testFilePath, "{ malformed json content !!!");

        var repo = new JsonRollRepository(_testFilePath);
        var rolls = repo.GetAll();

        Assert.Equal(DefaultRolls.All.Count, rolls.Count);
        Assert.Contains(rolls, r => r.Id == "roll-1520");
    }

    [Fact]
    public void BR_051_FileWithInvalidRoll_IgnoresInvalidAndKeepsValid()
    {
        // JSON com 1 rolo válido e 1 rolo inválido (largura útil negativa)
        var json = """
        [
          { "Id": "valid-1", "Name": "Rolo Válido", "PhysicalWidthMm": 1500, "MarginLeftMm": 15, "MarginRightMm": 15, "UsableWidthMm": 1470 },
          { "Id": "invalid-2", "Name": "Rolo Inválido", "PhysicalWidthMm": 10, "MarginLeftMm": 15, "MarginRightMm": 15, "UsableWidthMm": -20 }
        ]
        """;
        File.WriteAllText(_testFilePath, json);

        var repo = new JsonRollRepository(_testFilePath);
        var rolls = repo.GetAll();

        Assert.Single(rolls);
        Assert.Equal("valid-1", rolls[0].Id);
    }
}
