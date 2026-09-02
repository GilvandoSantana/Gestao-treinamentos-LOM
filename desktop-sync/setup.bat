@echo off
REM Prepara o programa de sincronizacao para rodar - faz tudo de uma vez:
REM instala as dependencias do programa principal E publica o programa
REM auxiliar (CloudFilterHost). Rode este arquivo (duplo clique, ou
REM "setup.bat" no PowerShell) toda vez que baixar o projeto de novo do
REM zero (ZIP novo do GitHub) antes de tentar "npm start".

echo ============================================
echo  Preparando o programa de sincronizacao...
echo ============================================
echo.

echo [1/2] Instalando dependencias do programa principal...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERRO no "npm install" - veja a mensagem acima.
    pause
    exit /b 1
)

echo.
echo [2/2] Publicando o programa auxiliar (CloudFilterHost)...
cd native\CloudFilterHost
call dotnet publish -c Release
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERRO no "dotnet publish" - veja a mensagem acima.
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

echo.
echo ============================================
echo  Tudo pronto! Rode "npm start" para abrir o programa.
echo ============================================
pause
