for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process %%a on port 3001...
    taskkill /PID %%a /F
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5500 ^| findstr LISTENING') do (
    echo Killing process %%a on port 5500...
    taskkill /PID %%a /F
)