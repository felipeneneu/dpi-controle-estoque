@echo off
setlocal enableextensions enabledelayedexpansion
title SeamsCLI - Emendas de Banners

rem ------------------------------------------------------------
rem Localizacao do executavel
rem ------------------------------------------------------------
set "BIN=%~dp0sidecars\bin\seams-cli\SeamsCLI.exe"
if not exist "%BIN%" set "BIN=%~dp0sidecars\SeamsCLI\bin\Release\net10.0\win-x64\publish\SeamsCLI.exe"
if not exist "%BIN%" set "BIN=%~dp0sidecars\SeamsCLI\bin\Release\net10.0\SeamsCLI.exe"
if not exist "%BIN%" set "BIN=%~dp0sidecars\SeamsCLI\bin\Debug\net10.0\SeamsCLI.exe"

if not exist "%BIN%" (
    echo ============================================================
    echo [ERRO CRITICO] SeamsCLI.exe nao encontrado!
    echo Procurado em:
    echo   sidecars\bin\seams-cli\
    echo   sidecars\SeamsCLI\bin\Release\net10.0\win-x64\publish\
    echo   sidecars\SeamsCLI\bin\Release\net10.0\
    echo   sidecars\SeamsCLI\bin\Debug\net10.0\
    echo.
    echo Compile primeiro:
    echo   dotnet publish sidecars/SeamsCLI -c Release -r win-x64 --self-contained
    echo ============================================================
    pause
    exit /b 1
)

rem ------------------------------------------------------------
rem Deteccao de drag & drop (arquivo passado como argumento)
rem ------------------------------------------------------------
set "RAW_ARGS=%*"
if defined RAW_ARGS (
    if exist "%~1" (
        call :resetar_config
        set "INPUT=%~1"
        goto menu_principal
    )
    rem Caminho com espacos sem aspas
    set "CLEAN_ALL=%RAW_ARGS:"=%"
    if exist "!CLEAN_ALL!" (
        call :resetar_config
        set "INPUT=!CLEAN_ALL!"
        goto menu_principal
    )
)

goto pedir_arquivo

rem ------------------------------------------------------------
rem Limpeza de estado (preserva BIN)
rem ------------------------------------------------------------
:resetar_config
set "INPUT="
set "USER_INPUT="
set "TMP="
set "SEL="
set "NEXT="
set "ROLL=1520"
set "MARGIN=15"
set "OVERLAP=10"
set "SHRINKAGE="
set "ORIENTATION=vert"
set "DIRECTION=ltr"
set "GUIDE_OPT=--guide-line"
set "LINE_COLOR=k40"
set "LINE_THICKNESS=1.0"
set "JOB="
set "OUT_DIR="
set "IN_DIR="
set "STDERR_FILE="
set "EXIT_CODE="
set "ERR_OPT="
goto :eof

rem ------------------------------------------------------------
rem Prompt inicial
rem ------------------------------------------------------------
:pedir_arquivo
call :resetar_config
cls
echo ============================================================
echo   SeamsCLI - EMENDAS DE BANNERS
echo ============================================================
echo.
echo  Arraste o arquivo (JPG, TIFF ou PDF) para esta janela
echo  e pressione [ENTER] (ou apenas ENTER para sair):
echo.
set /p "USER_INPUT=>> Arquivo: "

if "!USER_INPUT!"=="" goto sair

set "INPUT=!USER_INPUT:"=!"
:trim_input
if "!INPUT:~-1!"==" " (
    set "INPUT=!INPUT:~0,-1!"
    goto trim_input
)

if not exist "!INPUT!" (
    echo.
    echo [ERRO] Arquivo nao encontrado:
    echo "!INPUT!"
    echo.
    pause
    goto pedir_arquivo
)

rem ------------------------------------------------------------
rem Menu: rolo
rem ------------------------------------------------------------
:menu_principal
cls
echo ============================================================
echo   SeamsCLI - CONFIGURACAO DA EMENDA
echo ============================================================
echo  Arquivo: "!INPUT!"
echo ============================================================
echo.
echo  QUAL A LARGURA DA BOBINA (ROLO) QUE VOCE VAI USAR?
echo   [1] 1520 mm   [ENTER - Padrao Industria BR]
echo   [2] 1270 mm
echo   [3] 1060 mm
echo   [4]  910 mm
echo   [5] Personalizado (digitar largura em mm)
echo.
set "TMP=1"
set /p "TMP=Escolha a bobina [1]: "
if not "!TMP!"=="" set "TMP=!TMP: =!"
set "SEL=!TMP:~0,1!"
if "!SEL!"=="2" set "ROLL=1270"
if "!SEL!"=="3" set "ROLL=1060"
if "!SEL!"=="4" set "ROLL=910"
if "!SEL!"=="5" goto menu_roll_custom
goto menu_ajustes

:menu_roll_custom
echo.
set "TMP="
set /p "TMP=Largura do rolo em mm [1520]: "
if not "!TMP!"=="" set "ROLL=!TMP!"

rem ------------------------------------------------------------
rem Menu: ajustes finos
rem ------------------------------------------------------------
:menu_ajustes
echo.
echo ------------------------------------------------------------
echo  AJUSTES (ENTER mantem o valor entre colchetes)
echo ------------------------------------------------------------
set "TMP="
set /p "TMP=Margem lateral por lado em mm [!MARGIN!]: "
if not "!TMP!"=="" set "MARGIN=!TMP!"

set "TMP="
set /p "TMP=Sobreposicao da emenda em mm [!OVERLAP!]: "
if not "!TMP!"=="" set "OVERLAP=!TMP!"

set "TMP="
set /p "TMP=Aplicar encolhimento termico (S/N) [N]: "
if /i "!TMP!"=="s"   set "SHRINKAGE=--shrinkage"
if /i "!TMP!"=="sim" set "SHRINKAGE=--shrinkage"

set "TMP="
set /p "TMP=Orientacao (V=vertical / H=horizontal) [V]: "
if /i "!TMP!"=="h" set "ORIENTATION=horiz"

set "TMP="
set /p "TMP=Ordem dos paineis (L=esq->dir / R=dir->esq) [L]: "
if /i "!TMP!"=="r" set "DIRECTION=rtl"

rem ------------------------------------------------------------
rem Menu: Linha-guia de emenda (marca visual de solda)
rem ------------------------------------------------------------
echo.
echo ------------------------------------------------------------
echo  LINHA-GUIA DA EMENDA (Marca visual para alinhamento e solda)
echo ------------------------------------------------------------
set "TMP="
set /p "TMP=Desenhar linha-guia na sobreposicao? (S/N) [S]: "
if /i "!TMP!"=="n" (
    set "GUIDE_OPT=--no-guide-line"
    goto menu_job_info
)
if /i "!TMP!"=="nao" (
    set "GUIDE_OPT=--no-guide-line"
    goto menu_job_info
)
set "GUIDE_OPT=--guide-line"

echo.
echo  COR DA LINHA-GUIA:
echo   [1] Cinza K40%%   [ENTER - Padrao recomendado para banners]
echo   [2] Preto K100%%  (Para fundos claros)
echo   [3] Magenta      (M100%% - Alto contraste)
echo   [4] Branco       (Para fundos escuros/pretos)
echo   [5] Ciano        (C100%%)
echo   [6] Outra        (digitar nome ou C,M,Y,K)
set "TMP=1"
set /p "TMP=Escolha a cor [1]: "
if not "!TMP!"=="" set "TMP=!TMP: =!"
set "SEL=!TMP:~0,1!"
if "!SEL!"=="2" set "LINE_COLOR=k100"
if "!SEL!"=="3" set "LINE_COLOR=magenta"
if "!SEL!"=="4" set "LINE_COLOR=white"
if "!SEL!"=="5" set "LINE_COLOR=cyan"
if "!SEL!"=="6" goto menu_cor_custom
goto menu_espessura

:menu_cor_custom
echo.
set "TMP="
set /p "TMP=Digite a cor (ex: red, yellow, ou 0,100,100,0) [k40]: "
if not "!TMP!"=="" set "LINE_COLOR=!TMP!"

:menu_espessura
echo.
echo  ESPESSURA DO RISCO (GROSSURA):
echo   [1] 1.0 pt  [ENTER - Padrao equilibrado]
echo   [2] 1.5 pt  (Mais visivel para montador)
echo   [3] 2.0 pt  (Grosso / paineis grandes)
echo   [4] 0.5 pt  (Fino / discreto)
echo   [5] Outra   (digitar em pontos pt)
set "TMP=1"
set /p "TMP=Escolha a espessura [1]: "
if not "!TMP!"=="" set "TMP=!TMP: =!"
set "SEL=!TMP:~0,1!"
if "!SEL!"=="2" set "LINE_THICKNESS=1.5"
if "!SEL!"=="3" set "LINE_THICKNESS=2.0"
if "!SEL!"=="4" set "LINE_THICKNESS=0.5"
if "!SEL!"=="5" goto menu_espessura_custom
goto menu_job_info

:menu_espessura_custom
echo.
set "TMP="
set /p "TMP=Digite a espessura em pontos pt [1.0]: "
if not "!TMP!"=="" (
    set "TMP=!TMP:,=.!"
    set "LINE_THICKNESS=!TMP!"
)

:menu_job_info
echo.
set "TMP="
set /p "TMP=Nome do job (ENTER = nome do arquivo): "
if "!TMP!"=="" (
    for %%F in ("!INPUT!") do set "JOB=%%~nF"
) else (
    set "JOB=!TMP!"
)

rem Diretorio de saida (pasta \saida ao lado do arquivo)
for %%F in ("!INPUT!") do set "IN_DIR=%%~dpF"
set "OUT_DIR=!IN_DIR!saida"

goto rodar

rem ------------------------------------------------------------
rem Execucao
rem ------------------------------------------------------------
:rodar
echo.
echo ============================================================
echo PROCESSANDO EMENDA...
echo Arquivo:     "!INPUT!"
echo Rolo:        !ROLL! mm
echo Margem:      !MARGIN! mm/lado
echo Overlap:     !OVERLAP! mm
echo Orientacao:  !ORIENTATION!
echo Ordem:       !DIRECTION!
if "!GUIDE_OPT!"=="--no-guide-line" (
    echo Linha-guia:  DESATIVADA
) else (
    echo Linha-guia:  ATIVA (Cor: !LINE_COLOR!, Espessura: !LINE_THICKNESS! pt)
)
echo Job:         !JOB!
echo Saida:       "!OUT_DIR!"
if defined SHRINKAGE echo Encolhimento: SIM
echo ============================================================
echo.

set "STDERR_FILE=%TEMP%\seamscli_stderr.txt"

"%BIN%" "!INPUT!" ^
    --roll !ROLL! ^
    --margin !MARGIN! ^
    --overlap !OVERLAP! ^
    --orientation !ORIENTATION! ^
    --direction !DIRECTION! ^
    !GUIDE_OPT! ^
    --line-color "!LINE_COLOR!" ^
    --line-thickness !LINE_THICKNESS! ^
    --job "!JOB!" ^
    --outdir "!OUT_DIR!" ^
    !SHRINKAGE! ^
    2>"!STDERR_FILE!"

set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0"   goto tratar_sucesso
if "%EXIT_CODE%"=="1"   goto tratar_input
if "%EXIT_CODE%"=="2"   goto tratar_calculo
if "%EXIT_CODE%"=="3"   goto tratar_export
if "%EXIT_CODE%"=="4"   goto tratar_io
if "%EXIT_CODE%"=="130" goto tratar_cancel
goto tratar_desconhecido

rem ------------------------------------------------------------
rem Handlers
rem ------------------------------------------------------------
:tratar_sucesso
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  [OK] Paineis e emenda(s) gerados com fidelidade 1:1!
echo  Pasta de saida: "!OUT_DIR!"
echo ============================================================
echo.
echo  Arquivos gerados:
if exist "!OUT_DIR!\!JOB!_painel_*" (
    dir /b "!OUT_DIR!\!JOB!_painel_*" 2>nul
) else (
    echo  (nenhum arquivo correspondente encontrado)
)
echo.
echo  ------------------------------------------------------------
echo  Log de diagnostico gravado na pasta 'logs\' ao lado do executavel.
echo  (Envie a pasta 'logs\' com feedback.txt para relatar observacoes)
echo  ------------------------------------------------------------
echo.
goto proximo

:tratar_input
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  [ERRO 1] Argumento invalido.
echo ============================================================
echo.
if exist "!STDERR_FILE!" type "!STDERR_FILE!"
echo.
set "ERR_OPT="
set /p "ERR_OPT=Voltar ao menu de configuracao? [S/n]: "
if /i "!ERR_OPT!"=="n" goto proximo
goto menu_principal

:tratar_calculo
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  [ERRO 2] Nao foi possivel calcular os paineis.
echo  Rolo pode estar muito estreito, ou overlap invalido.
echo ============================================================
if exist "!STDERR_FILE!" type "!STDERR_FILE!"
echo.
set "ERR_OPT="
set /p "ERR_OPT=Ajustar rolo / overlap? [S/n]: "
if /i "!ERR_OPT!"=="n" goto proximo
goto menu_principal

:tratar_export
echo.
echo ============================================================
echo  [ERRO 3] Falha de exportacao / preflight.
echo ============================================================
if exist "!STDERR_FILE!" (
    type "!STDERR_FILE!"
    del "!STDERR_FILE!" 2>nul
)
echo.
echo  Causas comuns:
echo    - Arquivo em RGB (a GraficaOS exige CMYK)
echo    - PDF com camadas OCG (incompativel com PDF/X-1a)
echo    - PDF com transparencias nao achatadas
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolher outro arquivo? [S/n]: "
if /i "!ERR_OPT!"=="n" goto proximo
goto pedir_arquivo

:tratar_io
echo.
echo ============================================================
echo  [ERRO 4] Erro de I/O (disco cheio, permissao, etc).
echo ============================================================
if exist "!STDERR_FILE!" (
    type "!STDERR_FILE!"
    del "!STDERR_FILE!" 2>nul
)
echo.
set "ERR_OPT="
set /p "ERR_OPT=Tentar novamente? [S/n]: "
if /i "!ERR_OPT!"=="n" goto proximo
goto rodar

:tratar_cancel
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo [CANCELADO] Operacao interrompida pelo usuario.
echo.
goto proximo

:tratar_desconhecido
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  [ERRO] Codigo de saida inesperado: %EXIT_CODE%
echo ============================================================
echo.
goto proximo

rem ------------------------------------------------------------
rem Proximo arquivo
rem ------------------------------------------------------------
:proximo
echo.
echo ============================================================
echo  Deseja processar outro arquivo?
echo  (arraste para esta janela ou pressione ENTER para sair)
echo ============================================================
set "USER_INPUT="
set /p "USER_INPUT=>> Proximo: "
if "!USER_INPUT!"=="" goto sair

set "NEXT=!USER_INPUT:"=!"
:trim_next
if "!NEXT:~-1!"==" " (
    set "NEXT=!NEXT:~0,-1!"
    goto trim_next
)
if not exist "!NEXT!" (
    echo [ERRO] Arquivo nao encontrado.
    goto proximo
)
call :resetar_config
set "INPUT=!NEXT!"
goto menu_principal

rem ------------------------------------------------------------
:sair
echo.
echo ============================================================
echo  Fim da sessao. Ate logo!
echo ============================================================
endlocal
exit /b 0
