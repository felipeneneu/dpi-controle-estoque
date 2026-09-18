@echo off
rem Atalho: chapa offset 700x1000 mm
rem Chama MontarPDF.bat com preset (pula menu de formato)
set "MONTAR_PRESET=chapa_70x100"
call "%~dp0MontarPDF.bat" %*