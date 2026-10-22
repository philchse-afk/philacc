@echo off
echo.
choice /c on /t 10 /d o /m "Activer la synchro des ecrans (O = oui, N = non, defaut : oui dans 10 s)"
if errorlevel 2 (
    set SYNC=off
    echo Synchro DESACTIVEE
) else (
    set SYNC=
    echo Synchro ACTIVEE
)
echo.
start "Accords" node "C:\inetpub\philacc\stopstart5500.js"
start "Multimedia" node "C:\inetpub\philacc\stopstart3001.js"
