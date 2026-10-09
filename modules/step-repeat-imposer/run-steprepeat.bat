@echo off
chcp 65001 > nul
title GraficaOS - Step ^& Repeat Imposer CLI
cls

set EXE_PATH=%~dp0src\StepRepeatCLI\bin\Release\net10.0\StepRepeatCLI.exe
set DROPPED_FILE=%1

if exist "%EXE_PATH%" (
    if not "%DROPPED_FILE%"=="" (
        "%EXE_PATH%" "%DROPPED_FILE%"
    ) else (
        "%EXE_PATH%" --interactive
    )
) else (
    if not "%DROPPED_FILE%"=="" (
        dotnet run --no-restore -v q --project "%~dp0src\StepRepeatCLI\StepRepeatCLI.csproj" -c Release -- "%DROPPED_FILE%"
    ) else (
        dotnet run --no-restore -v q --project "%~dp0src\StepRepeatCLI\StepRepeatCLI.csproj" -c Release -- --interactive
    )
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Processamento finalizado com sucesso!
) else (
    echo.
    echo Ocorreu uma falha no processamento.
)

echo.
pause
