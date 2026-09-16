@echo off
setlocal enableextensions enabledelayedexpansion
title Auto Imposer CLI - Imposicao de Chapas

set "BIN=%~dp0sidecars\bin\cli\AutoImposerCLI.exe"
if not exist "%BIN%" (
    set "BIN=%~dp0sidecars\AutoImposerCLI\bin\Release\net8.0\win-x64\publish\AutoImposerCLI.exe"
)

set "RAW_ARGS=%*"
set "PDF="

rem 1. Se todos os argumentos juntos formam um arquivo existente (ex: arquivo com espacos arrastado sobre o .bat)
if defined RAW_ARGS (
    set "CLEAN_ALL=%RAW_ARGS:"=%"
    if exist "!CLEAN_ALL!" (
        set "PDF=!CLEAN_ALL!"
        goto menu_opcoes
    )
    rem 2. Se o primeiro parametro ja for um arquivo existente entre aspas
    if exist "%~1" (
        set "PDF=%~1"
        rem Se alem do arquivo foram passados parametros de largura/altura por CLI
        if not "%~2"=="" (
            set "PW=%~2"
            set "PH=%~3"
            set "GAP=%~4"
            set "MARG=%~5"
            if "!PW!"=="" set "PW=700"
            if "!PH!"=="" set "PH=1000"
            if "!GAP!"=="" set "GAP=2"
            if "!MARG!"=="" set "MARG=10"
            set "ROT=auto"
            goto rodar
        )
        goto menu_opcoes
    )
)

:pedir_pdf
cls
echo ============================================================
echo   AUTO IMPOSER CLI - REPETICAO DE MATRIZES (STEP E REPEAT)
echo ============================================================
echo.
echo  Arraste o arquivo PDF aqui para dentro desta janela
echo  e pressione [ENTER] (ou digite o caminho completo):
echo.
set "USER_INPUT="
set /p "USER_INPUT=>> PDF: "

if "!USER_INPUT!"=="" (
    echo.
    echo [AVISO] Nenhum arquivo informado.
    goto sair
)

rem Limpa aspas e espacos do input
set "PDF=!USER_INPUT:"=!"
:trim_space
if "!PDF:~-1!"==" " (
    set "PDF=!PDF:~0,-1!"
    goto trim_space
)

if not exist "!PDF!" (
    echo.
    echo [ERRO] Arquivo nao encontrado:
    echo "!PDF!"
    echo.
    goto sair
)

:menu_opcoes
cls
echo ============================================================
echo   AUTO IMPOSER CLI - CONFIGURACAO DA CHAPA
echo ============================================================
echo  Arquivo selecionado:
echo  "%PDF%"
echo ============================================================
echo.
echo  ESCOLHA UMA OPCAO DE FORMATO:
echo.
echo   [1] Chapa 700 x 1000 mm (Padrao) - Gap: 2mm, Margem: 10mm  [ENTER]
echo   [2] Meia Chapa 500 x 700 mm      - Gap: 2mm, Margem: 10mm
echo   [3] Chapa Grande 1000 x 1500 mm  - Gap: 2mm, Margem: 10mm
echo   [4] Folha SRA3 330 x 480 mm      - Gap: 2mm, Margem: 5mm (Konica)
echo   [5] Personalizado (definir dimensoes, gap e margens)
echo.
echo ============================================================
set "OPCAO=1"
set /p "OPCAO=Digite o numero da opcao [1]: "

rem Remove espacos
set "OPCAO=!OPCAO: =!"
if "!OPCAO!"=="" set "OPCAO=1"
set "OPCAO_SEL=!OPCAO:~0,1!"

if "!OPCAO_SEL!"=="1" goto opt_700x1000
if "!OPCAO_SEL!"=="2" goto opt_500x700
if "!OPCAO_SEL!"=="3" goto opt_1000x1500
if "!OPCAO_SEL!"=="4" goto opt_sra3
if "!OPCAO_SEL!"=="5" goto opt_custom

echo.
echo [AVISO] Opcao invalida: "!OPCAO!"! Usando padrao [1] 700x1000 mm.
goto opt_700x1000

:opt_700x1000
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"
goto menu_rotacao

:opt_500x700
set "PW=500"
set "PH=700"
set "GAP=2"
set "MARG=10"
goto menu_rotacao

:opt_1000x1500
set "PW=1000"
set "PH=1500"
set "GAP=2"
set "MARG=10"
goto menu_rotacao

:opt_sra3
set "PW=330"
set "PH=480"
set "GAP=2"
set "MARG=5"
goto menu_rotacao

:opt_custom
echo.
echo ------------------------------------------------------------
echo  Parametros Personalizados (Apenas Enter usa o valor padrao)
echo ------------------------------------------------------------
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"
set /p "PW=Largura da chapa em mm [700]: "
set /p "PH=Altura da chapa em mm [1000]: "
set /p "GAP=Espacamento/Gap entre pecas em mm [2]: "
set /p "MARG=Margem da chapa em mm [10]: "
goto menu_rotacao

:menu_rotacao
set "ROT=auto"
echo.
echo ------------------------------------------------------------
echo  Orientacao / Rotacao das pecas:
echo   [1] Automatico (calcula melhor aproveitamento 0 ou 90 graus) [ENTER]
echo   [2] Forcar Direto (0 graus)
echo   [3] Forcar Rotacionado (90 graus)
echo ------------------------------------------------------------
set "ROTOPCAO=1"
set /p "ROTOPCAO=Escolha a orientacao [1]: "
set "ROTOPCAO=%ROTOPCAO: =%"
if "%ROTOPCAO%"=="" set "ROTOPCAO=1"
set "ROT_SEL=%ROTOPCAO:~0,1%"
if "%ROT_SEL%"=="2" set "ROT=0"
if "%ROT_SEL%"=="3" set "ROT=90"

:rodar
echo.
echo ============================================================
echo PROCESSANDO IMPOSICAO...
echo Chapa: !PW! x !PH! mm, Gap: !GAP! mm, Margem: !MARG! mm, Rotacao: !ROT!
echo ============================================================
echo.

if not exist "%BIN%" (
    echo [ERRO CRITICO] Executavel AutoImposerCLI.exe nao encontrado!
    echo Procurado em:
    echo "%BIN%"
    echo.
    echo Execute primeiro: dotnet publish sidecars\AutoImposerCLI -c Release -o sidecars\bin\cli
    echo.
    pause
    goto sair
)

"%BIN%" "!PDF!" !PW! !PH! !GAP! !MARG! --rotation !ROT!

echo.
:sair
echo.
echo ============================================================
echo Fim da operacao. Pressione qualquer tecla para encerrar.
pause
endlocal