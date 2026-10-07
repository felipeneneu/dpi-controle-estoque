# Checklist de Execução — `seams-export-jpg-hotfix`

| Task | Descrição | Status | Evidência |
|---|---|---|---|
| Task 0 | Regra R-021 em AGENTS.md, ADR-056, BR-054 e dependências NuGet | Concluída | Commit `1cb4a08`; Regra 18 (R-021) em `AGENTS.md`; ADR-056 criada e indexada em `ADR_INDEX.md` sem mojibake (R-009); `BR-054` atualizada; NuGet `BitMiracle.LibJpeg.NET` e `Magick.NET-Q8-AnyCPU` adicionados. |
| Task 1 | Implementação de `JpegCmykEncoder` com BitMiracle e remoção de stubs nativos | Concluída | `JpegCmykEncoder.cs` implementado com CMYK puro, APP14 Adobe (`ColorTransform=0`), sem APP0 JFIF, e chunking de perfil ICC FOGRA39 em APP2; removidos `LibJpegTurboNative` e `NativeLoader`; 52 testes aprovados em `Imposition.Render.Tests`. |
| Task 2 | Smoke E2E e validação cruzada (R-021) com arquivo real de fábrica | Concluída | `SeamsCLI` executado com sucesso sobre `Teste 02.jpg` (80,4 MB) gerando 2 painéis (17,4 MB e 8,0 MB); verificação de marcadores (SOI, APP14 ColorTransform=0, ausência de APP0) e decodificação CMYK com 4 canais aprovada via `Magick.NET`. |
| Task 3 | Governança e Ledger SDD (`progress.md`) | Em andamento | Ledger em `.sdd/seams-export-jpg-hotfix/progress.md` atualizado com métricas de execução e zero rulings. |
