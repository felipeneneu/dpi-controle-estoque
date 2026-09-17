# imposition-grid-cli

CLI NativeAOT (`win-x64`) que expõe o `packages/imposition-core` via
stdin/stdout JSON. Consumido pelo Electron/Next via `child_process`.

## Uso

```bash
echo '{"substrate":{...},"piece":{...},...}' | imposition-grid
```

## Exit codes

| Código | Significado |
|---|---|
| 0 | Sucesso (resultado em stdout) |
| 1 | JSON inválido |
| 2 | Erro de negócio (`E_*` do core) |
| 3 | Erro inesperado |

## Duplex

Passe `pairing` + `frontInput` no lugar do input single-sided:

```json
{
  "pairing": "HeadToHead",
  "frontInput": { /* mesmo schema single-sided */ }
}
```

## Build

```bash
dotnet publish -c Release -r win-x64 --self-contained -p:PublishAot=true
```

Binário em `bin/Release/net8.0/win-x64/publish/imposition-grid.exe`.

## Referências

- `docs/governance/adr/ADR-021` — GridSearchEngine.
- `docs/governance/adr/ADR-022` — DuplexPlanner.
