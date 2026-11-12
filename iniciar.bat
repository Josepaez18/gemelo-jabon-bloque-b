@echo off
rem Doble clic para encender el gemelo: instala lo que falte, arranca el servidor y abre el navegador.
cd /d "%~dp0"
title Gemelo digital - Bloque B

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias. Revisa la conexion a internet.
    pause
    exit /b 1
  )
)

echo.
echo Encendiendo el gemelo en http://localhost:5173
echo Deja esta ventana abierta mientras lo usas. Para apagarlo, cierrala o pulsa Ctrl+C.
echo.
call npm run dev
pause
