@echo off
setlocal

set "PM2_HOME=C:\Users\Onasis\.pm2"
set "PM2_PIPE_NAMESPACE=Onasis"
set "PM2_COMMAND=C:\Users\Onasis\AppData\Roaming\npm\pm2.cmd"
set "PM2_STARTUP_LOG=C:\Users\Onasis\.pm2\startup.log"

set "PM2_ATTEMPT=1"

:resurrect
echo [%date% %time%] PM2 resurrection attempt %PM2_ATTEMPT% started.>>"%PM2_STARTUP_LOG%"
call "%PM2_COMMAND%" resurrect >>"%PM2_STARTUP_LOG%" 2>&1
set "PM2_EXIT_CODE=%ERRORLEVEL%"

if "%PM2_EXIT_CODE%"=="0" goto success
if "%PM2_ATTEMPT%"=="3" goto failure

echo [%date% %time%] Attempt %PM2_ATTEMPT% failed with exit code %PM2_EXIT_CODE%; retrying in 20 seconds.>>"%PM2_STARTUP_LOG%"
set /a PM2_ATTEMPT+=1
timeout /t 20 /nobreak >>"%PM2_STARTUP_LOG%" 2>&1
goto resurrect

:success
echo [%date% %time%] PM2 resurrection succeeded on attempt %PM2_ATTEMPT%.>>"%PM2_STARTUP_LOG%"
exit /b 0

:failure
echo [%date% %time%] PM2 resurrection failed after %PM2_ATTEMPT% attempts; last exit code %PM2_EXIT_CODE%.>>"%PM2_STARTUP_LOG%"
exit /b %PM2_EXIT_CODE%
