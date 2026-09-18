@echo off
rem Atalho: rolo Mimaki (largura configuravel - edite abaixo se
rem sua Mimaki tiver boca diferente)
rem
rem NOTA: a largura padrao 1520mm serve para JV300-160 e
rem       modelos equivalentes. Se sua maquina tem outra boca,
rem       edite o valor em MontarPDF.bat bloco :opt_rolo.
set "MONTAR_PRESET=rolo_mimaki"
call "%~dp0MontarPDF.bat" %*