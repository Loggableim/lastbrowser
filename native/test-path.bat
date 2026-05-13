@echo off
echo Testing PATH...
set PATH=C:\Program Files\nodejs;%PATH%
where node
if %errorlevel% equ 0 (
    echo Node found!
    node --version
) else (
    echo Node NOT found in PATH
    echo PATH=%PATH%
)
echo Done.
pause
