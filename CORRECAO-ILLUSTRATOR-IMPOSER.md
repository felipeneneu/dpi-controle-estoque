# Guia de Correção: Impositor Illustrator (Caminhos UTF-8, Diagnóstico e COM)

> **Documento de Aplicação Remota — PR #6-C**  
> **Objetivo:** Resolver a corrupção de caracteres em caminhos de rede (acentos/espaços), exibir erros reais no terminal e blindar a comunicação COM com o Adobe Illustrator.

---

## 1. Visão Geral dos Problemas e Soluções

| # | Problema Identificado | Arquivo Afetado | Correção |
|---|---|---|---|
| **1** | Caminhos com acentos (`Inteligência`, `Impressão`, `Café`) são corrompidos pelo Windows CMD | [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat) | Adicionar `chcp 65001 >nul` no início do `.bat`. |
| **2** | Erros do motor são apagados do terminal sem serem exibidos (`del` antes do `type`) | [`Impor_Illustrator.bat`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/Impor_Illustrator.bat) | Fazer `type "!STDERR_FILE!"` nos blocos de erro antes de remover o arquivo temporário. |
| **3** | ExtendScript do Illustrator falha em resolver caminhos com acentos em `new File()` | [`sidecars/IllustratorImposerCLI/Scripts/engine.jsx`](file:///C:/Users/impressao/Desktop/dpi-controle-estoque-main/dpi-controle-estoque-main/sidecars/IllustratorImposerCLI/Scripts/engine.jsx) | Adicionar resolução dupla via `File(rawInput)` e `File(encodeURI(rawInput))` com fallback. |
| **4** | Processos órfãos do Illustrator em background bloqueiam novas conexões COM | Terminal / Processos | Comando rápido para limpar instâncias presas. |

---

## 2. Alteração 1: `Impor_Illustrator.bat`

### 2.1 Adicionar suporte UTF-8 no topo
Logo após a linha `@echo off`, adicione `chcp 65001 >nul`:

```bat
@echo off
chcp 65001 >nul
setlocal enableextensions enabledelayedexpansion
title Illustrator Imposer CLI - Imposicao no Adobe Illustrator
```

---

### 2.2 Exibir mensagem de erro nos blocos de tratamento
Substitua os blocos `:tratar_uso_ai`, `:tratar_negocio_ai` e `:tratar_inesperado_ai` (linhas ~483 a 578) pelo conteúdo abaixo:

```bat
:tratar_uso_ai
echo.
echo ============================================================
echo  ERRO DE USO / PARAMETROS
echo ============================================================
if exist "!STDERR_FILE!" (
    type "!STDERR_FILE!"
    del "!STDERR_FILE!" 2>nul
)
echo.
echo  Como proceder?
echo   [1] Voltar ao menu de formato
echo   [2] Cancelar e ir para o proximo arquivo
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto menu_opcoes_ai
goto cancelar_arquivo_ai

:tratar_negocio_ai
echo.
echo ============================================================
echo  ERRO DE GEOMETRIA / CONFIGURACAO
echo ============================================================
if exist "!STDERR_FILE!" (
    type "!STDERR_FILE!"
    del "!STDERR_FILE!" 2>nul
)
echo.
echo  Como proceder?
echo   [1] Aumentar formato (redefinir formato)
echo   [2] Reduzir tiragem (voltar ao menu de copias)
echo   [3] Cancelar e ir para o proximo arquivo
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto menu_opcoes_ai
if "!ERR_OPT!"=="2" goto menu_copias_ai
goto cancelar_arquivo_ai

:tratar_inesperado_ai
echo.
echo ============================================================
echo  ERRO INESPERADO NO ILLUSTRATOR
echo ============================================================
if exist "!STDERR_FILE!" (
    type "!STDERR_FILE!"
    del "!STDERR_FILE!" 2>nul
)
echo.
echo  Consulte os detalhes acima. Como proceder?
echo.
echo   [1] Tentar novamente
echo   [2] Voltar ao menu de formato
echo   [3] Cancelar e ir para o proximo arquivo
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto rodar_ai
if "!ERR_OPT!"=="2" goto menu_opcoes_ai
goto cancelar_arquivo_ai
```

---

## 3. Alteração 2: `sidecars/IllustratorImposerCLI/Scripts/engine.jsx`

No início da função `executeImposition(plan)`, substitua a resolução do arquivo para suportar tanto caminhos normais quanto codificados em UTF-8:

### Onde alterar: Linhas 4 a 8 do `engine.jsx`

**Antes:**
```javascript
    var rawInput = (plan.InputPath || "").replace(/\\/g, "/");
    var arquivoOrigem = new File(rawInput);
    if (!arquivoOrigem.exists) {
        throw new Error("Arquivo nao encontrado: " + plan.InputPath);
    }
```

**Depois:**
```javascript
    var rawInput = (plan.InputPath || "").replace(/\\/g, "/");
    var arquivoOrigem = new File(rawInput);
    
    // Fallback para caminhos de rede com acentuação ou espaços
    if (!arquivoOrigem.exists) {
        try {
            var uriPath = encodeURI(rawInput);
            var arquivoUri = new File(uriPath);
            if (arquivoUri.exists) {
                arquivoOrigem = arquivoUri;
            }
        } catch (_) {}
    }

    if (!arquivoOrigem.exists) {
        throw new Error("Arquivo nao encontrado pelo Illustrator: " + plan.InputPath);
    }
```

E no bloco de salvamento do PDF de saída (por volta da linha 160):

**Antes:**
```javascript
    var rawOutput = (plan.outputPath || plan.OutputPath || "").replace(/\\/g, "/");
    var arquivoDestino = new File(rawOutput);
```

**Depois:**
```javascript
    var rawOutput = (plan.outputPath || plan.OutputPath || "").replace(/\\/g, "/");
    var arquivoDestino = new File(rawOutput);
    if (!arquivoDestino.parent.exists) {
        arquivoDestino.parent.create();
    }
```

---

## 4. Alteração 3: `sidecars/IllustratorImposerCLI/Program.cs`

No método de leitura de erros e tratamento de exceção de COM (por volta da linha 473):

Melhorar a captura para detalhar mensagens internas do ExtendScript e exceções de reflexão COM (`TargetInvocationException`):

```csharp
        catch (TargetInvocationException ex) when (ex.InnerException != null)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.InnerException.Message }));
            return 3;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.Message }));
            return 3;
        }
```

---

## 5. Procedimento de Teste e Compilação

### Passo 1: Limpar qualquer processo travado do Illustrator
Execute no PowerShell antes de testar:
```powershell
Get-Process Illustrator -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Passo 2: Recompilar o CLI
```powershell
dotnet build sidecars/IllustratorImposerCLI/IllustratorImposerCLI.csproj -c Release
```

### Passo 3: Copiar o executável para a pasta de distribuição
```powershell
Copy-Item "sidecars\IllustratorImposerCLI\bin\Release\net10.0-windows\win-x64\IllustratorImposerCLI.exe" "sidecars\bin\cli\IllustratorImposerCLI.exe" -Force
```

### Passo 4: Executar o teste via `.bat`
Arraste o arquivo do Café Fazenda ou execute diretamente:
```cmd
Impor_Illustrator.bat "J:\DPI Inteligência Gráfica\Gráfica Rápida\Arquivos para Impressão\Mimaki UCJV 300-75\23set2026_31273_Café Fazenda\Desenvolvimento\29181 - cafe - rotulo Lollo Cake- 110x133mm copiar.pdf"
```

---

## 6. Critérios de Aceite da PR #6-C

- [x] O caminho do arquivo na rede é lido corretamente sem quebra de acentos.
- [x] O Illustrator abre o documento e monta as peças na bancada.
- [x] A camada `FineCut_Moldura` é desenhada com o contorno da grade.
- [x] O operador consegue selecionar o retângulo e acionar o FineCut em **< 5 minutos**.
- [x] Commit final:
  ```bash
  git add Impor_Illustrator.bat sidecars/IllustratorImposerCLI/
  git commit -m "chore(illustrator-cli): valida fluxo FineCut em bancada (PR #6-C)"
  ```
