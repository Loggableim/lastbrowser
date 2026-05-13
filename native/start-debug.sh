#!/bin/bash
cd /f/hermesbrowser/native
export ELECTRON_DEV=1
"C:\Users\logga\AppData\Roaming\npm\node_modules\electron\dist\electron.exe" . > /f/hermesbrowser/native/lastbrowser-debug.log 2>&1
