@echo off
rem echo.
rem choice /c on /t 10 /d o /m "Activer la synchro des ecrans (O = oui, N = non, defaut : oui dans 10 s)"
rem if errorlevel 2 (
rem     set SYNC=off
rem     echo Synchro DESACTIVEE
rem ) else (
rem     set SYNC=
rem     echo Synchro ACTIVEE
rem )
rem echo.
@echo off
set SYNC=off
start "Accords" node "C:\inetpub\philacc\stopstart5500.js"
set SYNC=
set PORT=5501
start "AccordsSync" node "C:\inetpub\philacc\servAcc.js"
start "Multimedia" node "C:\inetpub\philacc\stopstart3001.js"
