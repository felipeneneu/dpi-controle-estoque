@echo off
setlocal enableextensions enabledelayedexpansion
title Illustrator Imposer CLI - Imposicao no Adobe Illustrator

set "BIN=%~dp0sidecars\bin\cli\IllustratorImposerCLI.exe"
if not exist "%BIN%" (
    set "BIN=%~dp0sidecars\IllustratorImposerCLI\bin\Release\net10.0-windows\win-x64\IllustratorImposerCLI.exe"
)
if not exist "%BIN%" (
    set "BIN=%~dp0sidecars\IllustratorImposerCLI\bin\Release\net10.0-windows\win-x64\publish\IllustratorImposerCLI.exe"
)

rem Verificar se o executavel existe
if not exist "%BIN%" (
    echo ============================================================
    echo [ERRO CRITICO] Executavel IllustratorImposerCLI.exe nao encontrado!
    echo Procurado em:
    echo "%BIN%"
    echo.
    echo Execute primeiro: npm run build:cli:illustrator
    echo ============================================================
    echo.
    pause
    exit /b 1
)

rem Inicializa fila de arquivos caso parametros tenham sido passados (drag & drop ou CLI)
set "RAW_ARGS=%*"
if defined RAW_ARGS (
    rem 1. Se o primeiro parametro for um arquivo existente
    if exist "%~1" (
        rem Se alem do arquivo foram passados parametros numericos legados (largura/altura CLI)
        if not "%~2"=="" (
            if not exist "%~2" (
                call :resetar_estado_ai
                set "PDF=%~1"
                set "PW=%~2"
                set "PH=%~3"
                set "GAP=%~4"
                set "MARG=%~5"
                if "!PW!"=="" set "PW=750"
                if "!PH!"=="" set "PH=0"
                if "!GAP!"=="" set "GAP=2"
                if "!MARG!"=="" set "MARG=15"
                set "ROT=auto"
                set "FRAME_ARG=--finecut-frame 1"
                set "MODE_ARG=--open-after"
                set "MODO_LEGADO=1"
                goto rodar_ai
            )
        )
        rem Arquivo individual ou primeiro de multiplos arquivos arrastados juntos
        call :resetar_estado_ai
        set "PDF=%~1"
        shift
        goto menu_opcoes_ai
    )
    rem 2. Se todos os argumentos juntos formam um arquivo existente (ex: caminho com espacos sem aspas)
    set "CLEAN_ALL=%RAW_ARGS:"=%"
    if exist "!CLEAN_ALL!" (
        call :resetar_estado_ai
        set "PDF=!CLEAN_ALL!"
        goto menu_opcoes_ai
    )
)

rem Iniciar fluxo interativo
goto pedir_pdf_ai

rem ------------------------------------------------------------
rem Limpeza de estado por arquivo
rem ------------------------------------------------------------
:resetar_estado_ai
set "PDF="
set "USER_INPUT="
set "TARGET_ARG="
set "SURPLUS_ARG="
set "SUBSTRATE_ARG="
set "TRIM_ARG="
set "FRAME_ARG=--finecut-frame 1"
set "MODE_ARG=--open-after"
set "OUTPUT_ARG="
set "PEDIDO=max"
set "PW="
set "PH="
set "GAP="
set "MARG="
set "ROT=auto"
set "ROTOPCAO="
set "ROT_SEL="
set "COPIAS="
set "SURPLUS="
set "MAXLEN="
set "TMP="
set "OPCAO="
set "OPCAO_SEL="
set "FRAME_OPT="
set "MODE_OPT="
set "MODE_SEL="
set "PDF_DIR="
set "OUT_DIR="
set "STDERR_FILE="
set "EXIT_CODE="
set "ERR_OPT="
set "OPTION_1_LABEL="
set "OPTION_2_LABEL="
set "OPTION_3_LABEL="
set "OPTION_1_TARGET="
set "OPTION_2_TARGET="
set "OPTION_3_TARGET="
goto :eof

:pedir_pdf_ai
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
    goto sair_ai
)

rem Limpa aspas e espacos do input
set "PDF=!USER_INPUT:"=!"
:trim_space_ai
if "!PDF:~-1!"==" " (
    set "PDF=!PDF:~0,-1!"
    goto trim_space_ai
)

if not exist "!PDF!" (
    echo.
    echo [ERRO] Arquivo nao encontrado:
    echo "!PDF!"
    echo.
    echo Pressione qualquer tecla para tentar outro arquivo...
    pause >nul
    goto pedir_pdf_ai
)

:menu_opcoes_ai
cls
echo ============================================================
echo   IMPOSITOR ILLUSTRATOR - CONFIGURACAO DA CHAPA / ROLO
echo ============================================================
echo  Arquivo selecionado:
echo  "!PDF!"
echo ============================================================
echo.
echo  ESCOLHA UMA OPCAO DE FORMATO:
echo.
echo   [1] Rolo/Bobina Mimaki (Boca 750 mm) - Gap: 2mm, Margem: 15mm [ENTER]
echo   [2] Rolo/Bobina Larga (Boca 1520 mm) - Gap: 2mm, Margem: 15mm
echo   [3] Chapa 700 x 1000 mm              - Gap: 2mm, Margem: 10mm
echo   [4] Meia Chapa 500 x 700 mm          - Gap: 2mm, Margem: 10mm
echo   [5] Folha SRA3 330 x 480 mm          - Gap: 2mm, Margem: 5mm (Konica)
echo   [6] Personalizado (definir dimensoes)
echo.
echo ============================================================
set "OPCAO=1"
set /p "OPCAO=Digite o numero da opcao [1]: "

if not "!OPCAO!"=="" set "OPCAO=!OPCAO: =!"
if "!OPCAO!"=="" set "OPCAO=1"
set "OPCAO_SEL=!OPCAO:~0,1!"

if "!OPCAO_SEL!"=="1" goto opt_rolo_750
if "!OPCAO_SEL!"=="2" goto opt_rolo_1520
if "!OPCAO_SEL!"=="3" goto opt_700x1000_ai
if "!OPCAO_SEL!"=="4" goto opt_500x700_ai
if "!OPCAO_SEL!"=="5" goto opt_sra3_ai
if "!OPCAO_SEL!"=="6" goto opt_custom_ai

echo.
echo [AVISO] Opcao invalida: "!OPCAO!"! Usando padrao [1] Rolo 750 mm.
goto opt_rolo_750

rem ------------------------------------------------------------
rem Presets de Substrato
rem ------------------------------------------------------------

:opt_rolo_750
set "PW=750"
set "PH=0"
set "GAP=2"
set "MARG=15"
set "MAXLEN=10000"
set "TRIM_ARG="
set "SUBSTRATE_ARG=--substrate-kind roll --max-length !MAXLEN!"
goto menu_ajustes_ai

:opt_rolo_1520
set "PW=1520"
set "PH=0"
set "GAP=2"
set "MARG=15"
set "MAXLEN=10000"
set "TRIM_ARG="
set "SUBSTRATE_ARG=--substrate-kind roll --max-length !MAXLEN!"
goto menu_ajustes_ai

:opt_700x1000_ai
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes_ai

:opt_500x700_ai
set "PW=500"
set "PH=700"
set "GAP=2"
set "MARG=10"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes_ai

:opt_sra3_ai
set "PW=330"
set "PH=480"
set "GAP=2"
set "MARG=5"
set "SUBSTRATE_ARG="
set "TRIM_ARG="
goto menu_ajustes_ai

:opt_custom_ai
echo.
echo ------------------------------------------------------------
echo  PERSONALIZADO - DIMENSOES DO MATERIAL
echo ------------------------------------------------------------
set "PW=750"
set "PH=0"
set "GAP=2"
set "MARG=15"
set "SUBSTRATE_ARG="
set "TRIM_ARG="

set "TMP="
set /p "TMP=Largura em mm [750]: "
if not "!TMP!"=="" set "PW=!TMP!"

set "TMP="
set /p "TMP=Altura em mm (0 para rolo/bobina) [0]: "
if not "!TMP!"=="" set "PH=!TMP!"

if "!PH!"=="0" (
    set "MAXLEN=10000"
    set "TMP="
    set /p "TMP=Comprimento maximo do rolo em mm [10000]: "
    if not "!TMP!"=="" set "MAXLEN=!TMP!"
    set "SUBSTRATE_ARG=--substrate-kind roll --max-length !MAXLEN!"
) else (
    set "SUBSTRATE_ARG="
)
goto menu_ajustes_ai

rem ------------------------------------------------------------
rem Ajustes finos
rem ------------------------------------------------------------

:menu_ajustes_ai
echo.
echo ------------------------------------------------------------
echo  AJUSTES (ENTER mantem o valor entre colchetes)
echo ------------------------------------------------------------

set "TMP="
set /p "TMP=Gap entre pecas em mm [!GAP!]: "
if not "!TMP!"=="" set "GAP=!TMP!"

set "TMP="
set /p "TMP=Margem em mm [!MARG!]: "
if not "!TMP!"=="" set "MARG=!TMP!"

set "TMP="
set /p "TMP=Fechar prancheta na grade (N/Nao, S/Sim) [N]: "
if not "!TMP!"=="" set "TMP=!TMP: =!"
if /i "!TMP!"=="s"   set "TRIM_ARG=--trim-to-content"
if /i "!TMP!"=="sim" set "TRIM_ARG=--trim-to-content"

rem ------------------------------------------------------------
rem Moldura para FineCut
rem ------------------------------------------------------------

:menu_moldura_ai
echo.
echo ------------------------------------------------------------
echo  MOLDURA PARA FINECUT (MIMAKI)?
echo ------------------------------------------------------------
echo  [ENTER] Sim (padrao - desenha retangulo na camada FineCut_Moldura)
echo  [2]     Nao (apenas impoe as pecas)
echo ------------------------------------------------------------
set "FRAME_OPT="
set /p "FRAME_OPT=Escolha [ENTER para Sim]: "
if not "!FRAME_OPT!"=="" set "FRAME_OPT=!FRAME_OPT: =!"

if "!FRAME_OPT!"=="2" (
    set "FRAME_ARG=--finecut-frame 0"
) else (
    set "FRAME_ARG=--finecut-frame 1"
)

rem ------------------------------------------------------------
rem Rotacao
rem ------------------------------------------------------------

:menu_rotacao_ai
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

rem ------------------------------------------------------------
rem Copias + sobra
rem ------------------------------------------------------------

:menu_copias_ai
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
    goto menu_modo_execucao_ai
) else (
    set "TARGET_ARG=--target-copies !COPIAS!"
    set "PEDIDO=!COPIAS!"
    goto menu_surplus_ai
)

:menu_surplus_ai
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

rem ------------------------------------------------------------
rem Modo de Execucao (Bancada vs Silencioso)
rem ------------------------------------------------------------

:menu_modo_execucao_ai
echo.
echo ------------------------------------------------------------
echo  MODO DE EXECUCAO NO ILLUSTRATOR:
echo ------------------------------------------------------------
echo  [1] Modo Bancada (abre o Illustrator na tela pronto para o FineCut) [ENTER]
echo  [2] Modo Silencioso (processa em segundo plano e fecha o Illustrator)
echo ------------------------------------------------------------
set "MODE_OPT=1"
set /p "MODE_OPT=Escolha o modo [1]: "
if not "!MODE_OPT!"=="" set "MODE_OPT=!MODE_OPT: =!"
if "!MODE_OPT!"=="" set "MODE_OPT=1"
set "MODE_SEL=!MODE_OPT:~0,1!"

if "!MODE_SEL!"=="2" (
    set "MODE_ARG=--silent"
) else (
    set "MODE_ARG=--open-after"
)

rem ------------------------------------------------------------
rem Preparacao e execucao
rem ------------------------------------------------------------

:preparar_saida_ai
set "PDF_DIR=%~dp0"
for %%F in ("!PDF!") do set "PDF_DIR=%%~dpF"
set "OUT_DIR=!PDF_DIR!saida"
if not exist "!OUT_DIR!" mkdir "!OUT_DIR!"
set "OUTPUT_ARG=--output-dir "!OUT_DIR!""
goto rodar_ai

:rodar_ai
echo.
echo ============================================================
echo PROCESSANDO NO ADOBE ILLUSTRATOR...
echo Origem:   "!PDF!"
echo Material: !PW! x !PH! mm, Gap: !GAP! mm, Margem: !MARG! mm, Rotacao: !ROT!
echo Pedido:   !PEDIDO! copias
if "!FRAME_ARG!"=="--finecut-frame 1" echo Moldura FineCut: SIM (camada FineCut_Moldura)
if "!MODE_ARG!"=="--open-after"       echo Modo: BANCADA (mantem Illustrator aberto)
if "!MODE_ARG!"=="--silent"           echo Modo: SILENCIOSO (fecha Illustrator)
if defined TRIM_ARG echo Fechar prancheta na grade: SIM
echo ============================================================
echo.

rem Redirecionar stderr para arquivo temporario (para parsear OPTION_* no exit 4)
set "STDERR_FILE=%TEMP%\impostor_ai_stderr.txt"
"%BIN%" "!PDF!" !PW! !PH! !GAP! !MARG! --rotation !ROT! !TARGET_ARG! !SURPLUS_ARG! !SUBSTRATE_ARG! !TRIM_ARG! !FRAME_ARG! !MODE_ARG! !OUTPUT_ARG! 2>"!STDERR_FILE!"
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" goto sucesso_ai
if "%EXIT_CODE%"=="1" goto tratar_uso_ai
if "%EXIT_CODE%"=="2" goto tratar_negocio_ai
if "%EXIT_CODE%"=="3" goto tratar_inesperado_ai

rem Exit 4: parsear as opcoes do stderr e mostrar o menu de correcao
if "%EXIT_CODE%"=="4" (
    set "OPTION_1_LABEL="
    set "OPTION_2_LABEL="
    set "OPTION_3_LABEL="
    set "OPTION_1_TARGET="
    set "OPTION_2_TARGET="
    set "OPTION_3_TARGET="
    for /f "tokens=1,* delims==" %%A in ('type "!STDERR_FILE!" ^| findstr /b "OPTION_"') do set "%%A=%%B"

    type "!STDERR_FILE!" | findstr /v /b "OPTION_"
    del "!STDERR_FILE!"
    goto tratar_excesso_capacidade_ai
)

rem Outros erros: limpa stderr residual
if exist "!STDERR_FILE!" del "!STDERR_FILE!"
goto tratar_inesperado_ai

rem ------------------------------------------------------------
rem Handlers de status e erro
rem ------------------------------------------------------------

:sucesso_ai
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  [OK] Imposicao gerada com sucesso no Illustrator!
if defined OUT_DIR echo  Pasta de destino: "!OUT_DIR!"
echo ============================================================
echo.
if defined MODO_LEGADO goto sair_ai
goto proximo_arquivo_ai

:cancelar_arquivo_ai
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo [AVISO] Operacao cancelada para este arquivo.
echo.
if defined MODO_LEGADO goto sair_ai
goto proximo_arquivo_ai

:tratar_uso_ai
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO DE USO
echo ============================================================
echo  Argumentos invalidos. Verifique a mensagem acima.
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
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO DE GEOMETRIA / CONFIGURACAO
echo ============================================================
echo  A mensagem acima explica o problema. Como proceder?
echo.
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

:tratar_excesso_capacidade_ai
echo.
echo ============================================================
echo  PEDIDO EXCEDE A CAPACIDADE DA CHAPA
echo ============================================================
echo.
echo  Como proceder?
echo.
echo   [1] %OPTION_1_LABEL%
echo   [2] %OPTION_2_LABEL%
echo   [3] %OPTION_3_LABEL%
echo   [4] Aumentar chapa (voltar ao menu de formato)
echo   [5] Cancelar e ir para o proximo arquivo
echo.
set "ERR_OPT="
set /p "ERR_OPT=Escolha [1]: "
if not "!ERR_OPT!"=="" set "ERR_OPT=!ERR_OPT: =!"
if "!ERR_OPT!"=="" set "ERR_OPT=1"

if "!ERR_OPT!"=="1" (
    set "TARGET_ARG=--target-copies %OPTION_1_TARGET%"
    set "PEDIDO=%OPTION_1_TARGET%"
    goto rodar_ai
)
if "!ERR_OPT!"=="2" (
    set "TARGET_ARG=--target-copies %OPTION_2_TARGET%"
    set "PEDIDO=%OPTION_2_TARGET%"
    goto rodar_ai
)
if "!ERR_OPT!"=="3" (
    set "TARGET_ARG=--target-copies %OPTION_3_TARGET%"
    set "PEDIDO=%OPTION_3_TARGET%"
    goto rodar_ai
)
if "!ERR_OPT!"=="4" goto menu_opcoes_ai
goto cancelar_arquivo_ai

:tratar_inesperado_ai
if exist "!STDERR_FILE!" del "!STDERR_FILE!" 2>nul
echo.
echo ============================================================
echo  ERRO INESPERADO NO ILLUSTRATOR
echo ============================================================
echo  Consulte a mensagem acima. Como proceder?
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

rem ------------------------------------------------------------
rem Loop para proximo arquivo (fila de argumentos ou interativo)
rem ------------------------------------------------------------
:proximo_arquivo_ai
rem Se ainda houver arquivos na fila de argumentos (arrastados juntos)
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
        goto menu_opcoes_ai
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
    goto sair_ai
)

rem Limpa aspas e espacos do input
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

goto menu_opcoes_ai

:sair_ai
echo.
echo ============================================================
echo  Fim da operacao. Ate logo!
echo ============================================================
endlocal
exit /b 0
