@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Magav Android APK Builder
echo ============================================
echo.

set "ROOT_DIR=%~dp0"
set "CLIENT_DIR=%ROOT_DIR%web\client"
set "ANDROID_DIR=%ROOT_DIR%android"
set "ASSETS_WEB=%ANDROID_DIR%\app\src\main\assets\web"

:: Step 1: Build React frontend
echo [1/4] Building React frontend...
cd /d "%CLIENT_DIR%"
if not exist node_modules (
    echo Installing npm dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: npm install failed
        exit /b 1
    )
)
call npm run build
if !errorlevel! neq 0 (
    echo ERROR: React build failed
    exit /b 1
)
echo React build complete.
echo.

:: Step 2: Copy dist to Android assets
echo [2/4] Copying frontend to Android assets...
if exist "%ASSETS_WEB%" rmdir /s /q "%ASSETS_WEB%"
mkdir "%ASSETS_WEB%"
xcopy /s /e /q "%CLIENT_DIR%\dist\*" "%ASSETS_WEB%\" >nul
if !errorlevel! neq 0 (
    echo ERROR: Failed to copy frontend assets
    exit /b 1
)
echo Frontend assets copied.
echo.

:: Step 3: Build Android APK
echo [3/4] Building Android APK (debug)...
cd /d "%ANDROID_DIR%"
call "%ANDROID_DIR%\gradlew.bat" assembleDebug
if !errorlevel! neq 0 (
    echo ERROR: Gradle build failed
    exit /b 1
)
echo.

:: Step 4: Show output
echo [4/4] Build complete!
echo.
set "APK_PATH=%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK_PATH%" (
    echo APK location:
    echo   %APK_PATH%
    echo.
    for %%A in ("%APK_PATH%") do echo APK size: %%~zA bytes
) else (
    echo WARNING: APK not found at expected path.
    echo Check: %ANDROID_DIR%\app\build\outputs\apk\
)
echo.
echo ============================================
echo   Done!
echo ============================================
pause
