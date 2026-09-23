@echo off
setlocal enableextensions enabledelayedexpansion
title Auto Imposer CLI - Imposicao de Chapas

set "BIN=%~dp0sidecars\bin\cli\AutoImposerCLI.exe"
if not exist "%BIN%" (
    set "BIN=%~dp0sidecars\AutoImposerCLI\bin\Release\net10.0\win-x64\publish\AutoImposerCLI.exe"
)

rem Argumentos opcionais do CLI (preenchidos pelos menus; vazios no fluxo posicional legado)
set "TARGET_ARG="
set "SURPLUS_ARG="
set "SUBSTRATE_ARG="
set "TRIM_ARG="
set "OUTPUT_ARG="
set "PEDIDO=max"

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
        rem Se alem do arquivo foram passados parametros de largura/altura por CLI,
        rem preservar o fluxo posicional legado: vai direto para :rodar sem menus.
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

rem Se a variavel MONTAR_PRESET esta definida (chamado por atalho especializado),
rem pular o menu de formato e ir direto para o preset.
:menu_opcoes
if defined MONTAR_PRESET goto aplicar_preset
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
echo   [5] Personalizado (definir dimensoes)
echo   [6] Rolo/Bobina (so largura)
echo.
echo ============================================================
set "OPCAO=1"
set /p "OPCAO=Digite o numero da opcao [1]: "

rem Remove espacos (so se nao estiver vazio: strip de vazio eh bug do cmd)
if not "!OPCAO!"=="" set "OPCAO=!OPCAO: =!"
if "!OPCAO!"=="" set "OPCAO=1"
set "OPCAO_SEL=!OPCAO:~0,1!"

if "!OPCAO_SEL!"=="1" goto opt_700x1000
if "!OPCAO_SEL!"=="2" goto opt_500x700
if "!OPCAO_SEL!"=="3" goto opt_1000x1500
if "!OPCAO_SEL!"=="4" goto opt_sra3
if "!OPCAO_SEL!"=="5" goto opt_custom
if "!OPCAO_SEL!"=="6" goto opt_rolo

echo.
echo [AVISO] Opcao invalida: "!OPCAO!"! Usando padrao [1] 700x1000 mm.
goto opt_700x1000

:aplicar_preset
if /i "!MONTAR_PRESET!"=="chapa_70x100"  goto opt_700x1000
if /i "!MONTAR_PRESET!"=="sra3_konica"   goto opt_sra3
if /i "!MONTAR_PRESET!"=="rolo_mimaki"   goto opt_rolo
echo [ERRO] Preset desconhecido: !MONTAR_PRESET!
pause
goto sair

rem ------------------------------------------------------------
rem Presets (definem defaults, depois vao para :menu_ajustes)
rem ------------------------------------------------------------

:opt_700x1000
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes

:opt_500x700
set "PW=500"
set "PH=700"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes

:opt_1000x1500
set "PW=1000"
set "PH=1500"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes

:opt_sra3
set "PW=330"
set "PH=480"
set "GAP=2"
set "MARG=5"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes

:opt_custom
echo.
echo ------------------------------------------------------------
echo  PERSONALIZADO - DIMENSOES DA CHAPA
echo ------------------------------------------------------------
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="

set "TMP="
set /p "TMP=Largura da chapa em mm [700]: "
if not "!TMP!"=="" set "PW=!TMP!"

set "TMP="
set /p "TMP=Altura da chapa em mm [1000]: "
if not "!TMP!"=="" set "PH=!TMP!"

goto menu_ajustes

:opt_rolo
echo.
echo ------------------------------------------------------------
echo  ROLO / BOBINA
echo ------------------------------------------------------------
set "PW=1520"
set "PH=0"
set "GAP=2"
set "MARG=5"
set "MAXLEN=10000"
set "TRIM_ARG="
set "SUBSTRATE_ARG=--substrate-kind roll"

set "TMP="
set /p "TMP=Largura do rolo (boca) em mm [1520]: "
if not "!TMP!"=="" set "PW=!TMP!"

set "TMP="
set /p "TMP=Comprimento maximo em mm [10000]: "
if not "!TMP!"=="" set "MAXLEN=!TMP!"

set "SUBSTRATE_ARG=--substrate-kind roll --max-length !MAXLEN!"
goto menu_ajustes

rem ------------------------------------------------------------
rem Ajustes finos (todos os formatos passam aqui)
rem ------------------------------------------------------------

:menu_ajustes
echo.
echo ------------------------------------------------------------
echo  AJUSTES DA CHAPA (ENTER mantem o valor entre colchetes)
echo ------------------------------------------------------------

set "TMP="
set /p "TMP=Gap entre pecas em mm [!GAP!]: "
if not "!TMP!"=="" set "GAP=!TMP!"

set "TMP="
set /p "TMP=Margem da chapa em mm [!MARG!]: "
if not "!TMP!"=="" set "MARG=!TMP!"

set "TMP="
set /p "TMP=Fechar PDF na grade (N/Nao, S/Sim) [N]: "
if not "!TMP!"=="" set "TMP=!TMP: =!"
if /i "!TMP!"=="s"   set "TRIM_ARG=--trim-to-content"
if /i "!TMP!"=="sim" set "TRIM_ARG=--trim-to-content"

rem ------------------------------------------------------------
rem Marcas de corte
rem ------------------------------------------------------------

:menu_marcas
echo.
echo ------------------------------------------------------------
echo  MARCAS DE CORTE?
echo ------------------------------------------------------------
echo  [ENTER] Nao
echo  [1] Crop (Konica)
echo  [2] Mimaki Tipo 1 (plain)
echo  [3] Mimaki Tipo 1 (FCRM spot)
echo  [4] Mimaki Tipo 1 (FCRM + RDG_WHITE)
echo ------------------------------------------------------------
set "MARCAS_OPT="
set /p "MARCAS_OPT=Escolha [ENTER para Nao]: "
if not "!MARCAS_OPT!"=="" set "MARCAS_OPT=!MARCAS_OPT: =!"

set "MARKS_ARG="
if "!MARCAS_OPT!"=="1" set "MARKS_ARG=--marks --mark-type crop"
if "!MARCAS_OPT!"=="2" set "MARKS_ARG=--marks --mark-type mimaki-tipo1"
if "!MARCAS_OPT!"=="3" set "MARKS_ARG=--marks --mark-type mimaki-fcrm"
if "!MARCAS_OPT!"=="4" set "MARKS_ARG=--marks --mark-type mimaki-fcrm-rdg"

goto menu_rotacao

rem ------------------------------------------------------------
rem Rotacao
rem ------------------------------------------------------------

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
if not "!ROTOPCAO!"=="" set "ROTOPCAO=!ROTOPCAO: =!"
if "!ROTOPCAO!"=="" set "ROTOPCAO=1"
set "ROT_SEL=!ROTOPCAO:~0,1!"
if "!ROT_SEL!"=="2" set "ROT=0"
if "!ROT_SEL!"=="3" set "ROT=90"
goto menu_copias

rem ------------------------------------------------------------
rem Copias + sobra
rem ------------------------------------------------------------

:menu_copias
echo.
echo ------------------------------------------------------------
echo  QUANTAS COPIAS DESEJA?
echo ------------------------------------------------------------
echo  [ENTER] Capacidade maxima
echo  [N]     Numero especifico (ex: 200)
echo ------------------------------------------------------------
set "COPIAS="
set /p "COPIAS=Digite o numero [ENTER para maximo]: "
if not "!COPIAS!"=="" set "COPIAS=!COPIAS: =!"

if "!COPIAS!"=="" (
    set "TARGET_ARG="
    set "SURPLUS_ARG="
    set "PEDIDO=max"
    goto preparar_saida
) else (
    set "TARGET_ARG=--target-copies !COPIAS!"
    set "PEDIDO=!COPIAS!"
    goto menu_surplus
)

:menu_surplus
echo.
echo ------------------------------------------------------------
echo  SE PEDIR NUMERO ESPECIFICO, quantas extras deseja?
echo ------------------------------------------------------------
echo  [ENTER] Fechar a ultima linha (padrao - sobra p/ refile)
echo  [0]     Cortar exato no pedido
echo ------------------------------------------------------------
set "SURPLUS="
set /p "SURPLUS=Escolha [ENTER para fechar linha]: "
if not "!SURPLUS!"=="" set "SURPLUS=!SURPLUS: =!"

if "!SURPLUS!"=="0" (
    set "SURPLUS_ARG=--surplus truncate"
) else (
    set "SURPLUS_ARG=--surplus fill_row"
)
goto preparar_saida

rem ------------------------------------------------------------
rem Preparacao e execucao
rem ------------------------------------------------------------

:preparar_saida
set "PDF_DIR=%~dp0"
for %%F in ("!PDF!") do set "PDF_DIR=%%~dpF"
set "OUT_DIR=!PDF_DIR!saida"
if not exist "!OUT_DIR!" mkdir "!OUT_DIR!"
set "OUTPUT_ARG=--output-dir "!OUT_DIR!""
goto rodar

:rodar
echo.
echo ============================================================
echo PROCESSANDO IMPOSICAO...
echo Chapa: !PW! x !PH! mm, Gap: !GAP! mm, Margem: !MARG! mm, Rotacao: !ROT!
echo Pedido: !PEDIDO! copias
if defined TRIM_ARG echo Fechar PDF na grade: SIM
if defined MARKS_ARG echo Marcas de corte: SIM
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

rem Redirecionar stderr para arquivo temporario (para parsear OPTION_* no exit 4)
set "STDERR_FILE=%TEMP%\impostor_stderr.txt"
"%BIN%" "!PDF!" !PW! !PH! !GAP! !MARG! --rotation !ROT! !TARGET_ARG! !SURPLUS_ARG! !SUBSTRATE_ARG! !TRIM_ARG! !MARKS_ARG! !OUTPUT_ARG! 2>"!STDERR_FILE!"
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" goto sucesso
if "%EXIT_CODE%"=="1" goto tratar_uso
if "%EXIT_CODE%"=="2" goto tratar_negocio
if "%EXIT_CODE%"=="3" goto tratar_inesperado

rem Exit 4: parsear as opcoes do stderr e mostrar o menu de correcao
if "%EXIT_CODE%"=="4" (
    set "OPTION_1_LABEL="
    set "OPTION_2_LABEL="
    set "OPTION_3_LABEL="
    set "OPTION_1_TARGET="
    set "OPTION_2_TARGET="
    set "OPTION_3_TARGET="
    for /f "tokens=1,* delims==" %%A in ('type "!STDERR_FILE!" ^| findstr /b "OPTION_"') do set "%%A=%%B"

    rem Explicacao do CLI (tudo que NAO for OPTION_*) aparece antes do menu
    type "!STDERR_FILE!" | findstr /v /b "OPTION_"
    del "!STDERR_FILE!"
    goto tratar_excesso_capacidade
)

rem Outros erros (1/2/3): limpa stderr residual (explicacao sai no stdout)
if exist "!STDERR_FILE!" del "!STDERR_FILE!"
goto tratar_inesperado

rem ------------------------------------------------------------
rem Handlers de erro (nao mata o .bat, oferece correcao)
rem ------------------------------------------------------------

:sucesso
echo.
goto sair

:tratar_uso
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO DE USO
echo ============================================================
echo  Argumentos invalidos. Verifique a mensagem acima.
echo.
echo  Como proceder?
echo   [1] Voltar ao menu de formato
echo   [2] Cancelar
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto menu_opcoes
goto sair

:tratar_negocio
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO DE GEOMETRIA / CONFIGURACAO
echo ============================================================
echo  A mensagem acima explica o problema. Como proceder?
echo.
echo   [1] Aumentar chapa (redefinir formato)
echo   [2] Reduzir tiragem (voltar ao menu de copias)
echo   [3] Cancelar
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto menu_opcoes
if "!ERR_OPT!"=="2" goto menu_copias
goto sair

:tratar_excesso_capacidade
echo.
echo ============================================================
echo  PEDIDO EXCEDE A CAPACIDADE
echo ============================================================
echo.
echo  Como proceder?
echo.
echo   [1] %OPTION_1_LABEL%
echo   [2] %OPTION_2_LABEL%
echo   [3] %OPTION_3_LABEL%
echo   [4] Aumentar chapa (voltar ao menu de formato)
echo   [5] Cancelar
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"

if "!ERR_OPT!"=="1" (
    set "TARGET_ARG=--target-copies %OPTION_1_TARGET%"
    set "PEDIDO=%OPTION_1_TARGET%"
    goto rodar
)
if "!ERR_OPT!"=="2" (
    set "TARGET_ARG=--target-copies %OPTION_2_TARGET%"
    set "PEDIDO=%OPTION_2_TARGET%"
    goto rodar
)
if "!ERR_OPT!"=="3" (
    set "TARGET_ARG=--target-copies %OPTION_3_TARGET%"
    set "PEDIDO=%OPTION_3_TARGET%"
    goto rodar
)
if "!ERR_OPT!"=="4" goto menu_opcoes
goto sair

:tratar_inesperado
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO INESPERADO
echo ============================================================
echo  Consulte a mensagem acima. Como proceder?
echo.
echo   [1] Tentar novamente
echo   [2] Voltar ao menu de formato
echo   [3] Cancelar
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"
if "!ERR_OPT!"=="1" goto rodar
if "!ERR_OPT!"=="2" goto menu_opcoes
goto sair

:sair
echo.
echo ============================================================
echo Fim da operacao. Pressione qualquer tecla para encerrar.
pause
endlocal