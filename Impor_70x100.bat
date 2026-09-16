@echo off
setlocal enableextensions
set "BIN=%~dp0sidecars\bin\cli\AutoImposerCLI.exe"
set "PDF=%~1"
set "PW=700"
set "PH=1000"
set "GAP=2"
set "MARG=10"

rem Sem arquivo: pergunta interativamente (aceita Enter para usar o padrao)
if not "%PDF%"=="" goto tem_arquivo
echo ============================================================
echo  Modo manual: informe o PDF e os parametros da chapa.
echo  (Apenas Enter usa o valor padrao entre colchetes)
echo ============================================================
set /p "PDF=PDF caminho completo: "
if "%PDF%"=="" goto sair
set /p "PW=Largura da chapa em mm [700]: "
set /p "PH=Altura da chapa em mm [1000]: "
set /p "GAP=Espacamento entre pecas em mm [2]: "
set /p "MARG=Margem da chapa em mm [10]: "
goto rodar

:tem_arquivo
rem Arquivo solto: usa os padroes, ou os parametros extras se fornecidos
if not "%~2"=="" set "PW=%~2"
if not "%~3"=="" set "PH=%~3"
if not "%~4"=="" set "GAP=%~4"
if not "%~5"=="" set "MARG=%~5"

:rodar
echo PARAMETROS: %PW% x %PH% mm, gap %GAP% mm, margem %MARG% mm
%BIN% "%PDF%" %PW% %PH% %GAP% %MARG%

:sair
pause
endlocal