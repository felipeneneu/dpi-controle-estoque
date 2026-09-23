@echo off
setlocal enableextensions enabledelayedexpansion
title Illustrator Imposer CLI - Modo 100%% Automatico

set "BIN=%~dp0sidecars\bin\cli\IllustratorImposerCLI.exe"
if not exist "%BIN%" (
    echo ============================================================
    echo [ERRO] Binario nao encontrado em: "%BIN%"
    echo Execute "npm run build:cli:illustrator" primeiro.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

rem Se foi passado argumento via linha de comando ou drag & drop
if exist "%~1" (
    call :resetar_estado_ai
    set "PDF=%~1"
    shift
    goto configurar_ai
)

rem Se nenhum argumento foi passado, solicitar interativamente
goto pedir_pdf

rem ------------------------------------------------------------
rem Limpeza de estado por arquivo
rem ------------------------------------------------------------
:resetar_estado_ai
set "PDF="
set "USER_INPUT="
set "SHEET_W=750"
set "COPIAS=100"
set "GAP=2"
set "MARGIN=15"
set "MODO=1"
set "MANTER=1"
set "DIRNAME="
set "BASENAME="
set "OUTPUT="
goto :eof

:pedir_pdf
call :resetar_estado_ai
cls
echo ============================================================
echo   IMPOSITOR AUTOMATICO NO ADOBE ILLUSTRATOR (FINECUT / MIMAKI)
echo ============================================================
echo.
echo  Arraste o arquivo PDF aqui para dentro desta janela
echo  e pressione [ENTER] (ou apenas ENTER para sair):
echo.
set "USER_INPUT="
set /p "USER_INPUT=>> PDF da Arte: "

if "!USER_INPUT!"=="" (
    echo.
    echo Encerrando sessao do Illustrator.
    goto sair
)

set "PDF=!USER_INPUT:"=!"
:trim_space_ai
if "!PDF:~-1!"==" " (
    set "PDF=!PDF:~0,-1!"
    goto trim_space_ai
)

if not exist "!PDF!" (
    echo.
    echo [ERRO] Arquivo nao encontrado: "!PDF!"
    echo Pressione qualquer tecla para tentar outro arquivo...
    pause >nul
    goto pedir_pdf
)

goto configurar_ai

:configurar_ai
cls
echo ============================================================
echo   ARQUIVO SELECIONADO:
echo   "!PDF!"
echo ============================================================
echo.

set "SHEET_W=750"
set /p "SHEET_W=>> Largura da Bobina/Chapa em mm [Padrao 750]: "

set "COPIAS=100"
set /p "COPIAS=>> Tiragem Desejada (Total de Copias) [Padrao 100]: "

set "GAP=2"
set /p "GAP=>> Espacamento (Gap) entre pecas em mm [Padrao 2, 0 para colado]: "

set "MARGIN=15"
set /p "MARGIN=>> Margem lateral/superior em mm [Padrao 15, 0 para sem margem]: "

echo.
echo Escolha o modo de execucao:
echo   [1] MODO BANCADA   (Abre o Illustrator maximizado com FineCut pronto)
echo   [2] MODO SILENCIOSO (Gera o PDF e fecha o Illustrator)
set "MODO=1"
set /p "MODO=>> Opcao [Padrao 1]: "

set "MANTER=1"
if "!MODO!"=="2" set "MANTER=0"

for %%F in ("!PDF!") do (
    set "DIRNAME=%%~dpF"
    set "BASENAME=%%~nF"
)
set "OUTPUT=!DIRNAME!!BASENAME!_IMPOSTO_!SHEET_W!mm_!COPIAS!UN.pdf"

if not defined MARGIN set "MARGIN=15"

cls
echo ============================================================
echo   PROCESSANDO NO ADOBE ILLUSTRATOR...
echo ============================================================
echo  Origem:       "!PDF!"
echo  Destino:      "!OUTPUT!"
echo  Largura:      !SHEET_W! mm
echo  Copias:       !COPIAS! UN
echo  Gap:          !GAP! mm
echo  Margem:       !MARGIN! mm
echo  Colunas:      AUTOMATICO (calculado pelas dimensoes da peca)
echo  Linhas:       AUTOMATICO (calculado para atingir a meta)
echo  Comprimento:  AUTOMATICO (estende o rolo para caber tudo)
echo  Modo:         !MODO! (Manter Aberto: !MANTER!)
echo ============================================================
echo.
echo Aguarde... Abrindo e multiplicando vetores no Illustrator...

"%BIN%" "!PDF!" "!OUTPUT!" !SHEET_W! 0 !COPIAS! !GAP! !MARGIN! !MANTER!

echo.
echo ============================================================
echo  [OK] Processo finalizado com sucesso no Illustrator!
echo ============================================================
echo.
goto proximo_arquivo_ai

:proximo_arquivo_ai
rem Se houver proximo na fila de argumentos (arrastados juntos)
if not "%~1"=="" (
    if exist "%~1" (
        call :resetar_estado_ai
        set "PDF=%~1"
        shift
        echo.
        echo ============================================================
        echo  PROCESSANDO PROXIMO ARQUIVO DA FILA:
        echo  "!PDF!"
        echo ============================================================
        echo.
        goto configurar_ai
    )
)

call :resetar_estado_ai
echo ============================================================
echo   DESEJA PROCESSAR OUTRO ARQUIVO NO ILLUSTRATOR?
echo ============================================================
echo  Arraste o proximo arquivo PDF aqui para dentro
echo  e pressione [ENTER] (ou pressione apenas ENTER para sair):
echo.
set "USER_INPUT="
set /p "USER_INPUT=>> Proximo PDF: "

if "!USER_INPUT!"=="" (
    echo.
    echo Encerrando sessao do Illustrator.
    goto sair
)

set "PDF=!USER_INPUT:"=!"
:trim_space_ai_next
if "!PDF:~-1!"==" " (
    set "PDF=!PDF:~0,-1!"
    goto trim_space_ai_next
)

if not exist "!PDF!" (
    echo.
    echo [ERRO] Arquivo nao encontrado:
    echo "!PDF!"
    echo.
    echo Pressione qualquer tecla para tentar novamente...
    pause >nul
    goto proximo_arquivo_ai
)

goto configurar_ai

:sair
echo.
echo ============================================================
echo  Fim da operacao. Ate logo!
echo ============================================================
endlocal
exit /b 0
