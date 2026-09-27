@echo off
setlocal
cd /d "%~dp0.."
echo Preparing VEILWAKE. This will copy the demo video and run the release checks.
echo Nothing will be pushed to GitHub or posted to X.
echo.
node scripts\prepare-release.mjs %*
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo Preparation finished. Read the printed release report before publishing.) else (echo Preparation stopped. Review the error above; no publication was attempted.)
pause
exit /b %RESULT%
