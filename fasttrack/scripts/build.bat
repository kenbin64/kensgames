@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM Fast Track - Windows Build Script
REM 
REM ButterflyFX Substrate Model:
REM   Level 0 (VOID):   Source files — pure potential
REM   Level 4 (PLANE):  Executable built — INVOKE LEVEL
REM   Level 6 (WHOLE):  Distribution complete — meaning realized
REM ═══════════════════════════════════════════════════════════════════════════

setlocal enabledelayedexpansion

echo ═══════════════════════════════════════════════════════════════
echo             Fast Track - Windows Build System                    
echo            ButterflyFX Framework Demonstration                   
echo ═══════════════════════════════════════════════════════════════

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set NATIVE_DIR=%PROJECT_ROOT%\native
set OUTPUT_DIR=%PROJECT_ROOT%\dist

REM Parse arguments
set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=all

echo.
echo [Level 1 - POINT] Checking project structure...

if not exist "%NATIVE_DIR%\package.json" (
    echo ERROR: package.json not found in %NATIVE_DIR%
    exit /b 1
)

echo [Level 2 - LINE] Installing dependencies...
cd /d "%NATIVE_DIR%"

if not exist "node_modules" (
    call npm install
)

echo [Level 3 - WIDTH] Bundling game assets...

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%NATIVE_DIR%\game" mkdir "%NATIVE_DIR%\game"

REM Copy game files
echo Copying game files...
xcopy /E /Y /Q "%PROJECT_ROOT%\*.html" "%NATIVE_DIR%\game\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\js" "%NATIVE_DIR%\game\js\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\css" "%NATIVE_DIR%\game\css\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\assets" "%NATIVE_DIR%\game\assets\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\sounds" "%NATIVE_DIR%\game\sounds\" >nul 2>&1

echo [Level 4 - PLANE] Building executable packages...

if "%BUILD_TYPE%"=="web" goto :build_web
if "%BUILD_TYPE%"=="native" goto :build_native
if "%BUILD_TYPE%"=="steam" goto :build_steam
if "%BUILD_TYPE%"=="all" goto :build_all
goto :usage

:build_web
echo Building web version...
if not exist "%OUTPUT_DIR%\web" mkdir "%OUTPUT_DIR%\web"
xcopy /E /Y /Q "%PROJECT_ROOT%\*.html" "%OUTPUT_DIR%\web\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\js" "%OUTPUT_DIR%\web\js\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\css" "%OUTPUT_DIR%\web\css\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\assets" "%OUTPUT_DIR%\web\assets\" >nul 2>&1
xcopy /E /Y /Q "%PROJECT_ROOT%\sounds" "%OUTPUT_DIR%\web\sounds\" >nul 2>&1
echo Web build complete: %OUTPUT_DIR%\web\
goto :done

:build_native
echo Building native Electron app...
cd /d "%NATIVE_DIR%"
call npx electron-builder --win
xcopy /E /Y /Q "%NATIVE_DIR%\dist\*" "%OUTPUT_DIR%\" >nul 2>&1
echo Native build complete!
goto :done

:build_steam
echo Building Steam version...
cd /d "%NATIVE_DIR%"
if exist "electron-builder-steam.yml" (
    call npx electron-builder --config electron-builder-steam.yml
) else (
    echo Warning: Steam config not found, using standard build
    call npx electron-builder --win
)
xcopy /E /Y /Q "%NATIVE_DIR%\dist\*" "%OUTPUT_DIR%\" >nul 2>&1
echo Steam build complete!
goto :done

:build_all
call :build_web
call :build_native
goto :done

:usage
echo.
echo Usage: build.bat [type]
echo.
echo Types:
echo   web      - Build browser version only
echo   native   - Build native Electron app only
echo   steam    - Build Steam version with Greenworks
echo   all      - Build everything (default)
exit /b 1

:done
echo.
echo [Level 5 - VOLUME] Verifying build outputs...
echo.
echo Build outputs in: %OUTPUT_DIR%
dir "%OUTPUT_DIR%"

echo.
echo [Level 6 - WHOLE] Build complete - Ready for distribution!

echo.
echo ═══════════════════════════════════════════════════════════════
echo                     BUILD SUCCESSFUL                             
echo ═══════════════════════════════════════════════════════════════
echo.
echo Next steps:
echo   1. Test the build locally
echo   2. Upload to Steam (if Steam build)
echo   3. Deploy web version to butterflyfx.us/games/fasttrack
echo.

endlocal
