@echo off
cd /d "%~dp0"
echo ============================================
echo   reclu.cl - servidor local
echo ============================================
echo.
echo Levantando el servidor en el puerto 3000...
echo.
echo Cuando veas "Ready", abre en tu navegador:
echo.
echo     http://localhost:3000
echo.
echo (Para detenerlo, cierra esta ventana)
echo ============================================
echo.
npx next dev -p 3000 -H ::
