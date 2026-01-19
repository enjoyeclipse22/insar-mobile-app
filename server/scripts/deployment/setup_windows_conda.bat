@echo off
REM ===============================================================================
REM PyGMTSAR InSAR Processing Environment Setup Script for Windows
REM Using Conda/Mamba (Alternative to WSL2)
REM 
REM This script sets up the InSAR processing environment using Conda/Mamba
REM which is easier to install but may have some limitations compared to WSL2.
REM 
REM Requirements:
REM   - Windows 10/11
REM   - Internet connection
REM   - ~10GB free disk space
REM 
REM Usage:
REM   setup_windows_conda.bat
REM 
REM Author: InSAR Pro Team
REM Version: 1.0.0
REM ===============================================================================

setlocal EnableDelayedExpansion

echo.
echo ===============================================================================
echo   PyGMTSAR InSAR Processing Environment Setup
echo   Windows Installation Script (Conda Method)
echo ===============================================================================
echo.

set WORKSPACE=%USERPROFILE%\insar_workspace
set CONDA_ENV=insar

REM ===============================================================================
REM Step 1: Check for Conda/Mamba
REM ===============================================================================

echo [INFO] Step 1/4: Checking for Conda/Mamba...

where mamba >nul 2>&1
if %errorLevel% equ 0 (
    set CONDA_CMD=mamba
    echo [SUCCESS] Mamba found
    goto :conda_found
)

where conda >nul 2>&1
if %errorLevel% equ 0 (
    set CONDA_CMD=conda
    echo [SUCCESS] Conda found
    goto :conda_found
)

echo [WARNING] Conda/Mamba not found. Installing Miniforge...
echo.

REM Download and install Miniforge
set MINIFORGE_URL=https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Windows-x86_64.exe
set MINIFORGE_INSTALLER=%TEMP%\Miniforge3-Windows-x86_64.exe

echo [INFO] Downloading Miniforge...
powershell -Command "Invoke-WebRequest -Uri '%MINIFORGE_URL%' -OutFile '%MINIFORGE_INSTALLER%'"

if not exist "%MINIFORGE_INSTALLER%" (
    echo [ERROR] Failed to download Miniforge
    echo         Please download manually from: %MINIFORGE_URL%
    pause
    exit /b 1
)

echo [INFO] Installing Miniforge...
echo         Please follow the installer prompts.
echo         IMPORTANT: Select "Add to PATH" option!
start /wait "" "%MINIFORGE_INSTALLER%" /S /D=%USERPROFILE%\miniforge3

REM Refresh PATH
set PATH=%USERPROFILE%\miniforge3;%USERPROFILE%\miniforge3\Scripts;%USERPROFILE%\miniforge3\Library\bin;%PATH%
set CONDA_CMD=mamba

echo [SUCCESS] Miniforge installed

:conda_found

REM ===============================================================================
REM Step 2: Create Conda Environment
REM ===============================================================================

echo.
echo [INFO] Step 2/4: Creating Conda environment '%CONDA_ENV%'...

REM Check if environment exists
%CONDA_CMD% env list | findstr /i "%CONDA_ENV%" >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Environment '%CONDA_ENV%' already exists
    set /p RECREATE="Do you want to recreate it? (y/n): "
    if /i "!RECREATE!"=="y" (
        %CONDA_CMD% env remove -n %CONDA_ENV% -y
    ) else (
        goto :install_packages
    )
)

REM Create environment with Python
%CONDA_CMD% create -n %CONDA_ENV% python=3.11 -y

echo [SUCCESS] Conda environment created

:install_packages

REM ===============================================================================
REM Step 3: Install Packages
REM ===============================================================================

echo.
echo [INFO] Step 3/4: Installing packages...

REM Activate environment and install packages
call %CONDA_CMD% activate %CONDA_ENV%

REM Install GMT and dependencies from conda-forge
echo [INFO] Installing GMT and dependencies...
%CONDA_CMD% install -n %CONDA_ENV% -c conda-forge -y ^
    gmt ^
    numpy ^
    scipy ^
    pandas ^
    xarray ^
    dask ^
    distributed ^
    matplotlib ^
    cartopy ^
    netcdf4 ^
    h5py ^
    rasterio ^
    shapely ^
    geopandas ^
    requests ^
    tqdm

REM Install PyGMTSAR via pip
echo [INFO] Installing PyGMTSAR...
pip install pygmtsar asf_search

echo [SUCCESS] Packages installed

REM ===============================================================================
REM Step 4: Create Workspace and Scripts
REM ===============================================================================

echo.
echo [INFO] Step 4/4: Creating workspace...

if not exist "%WORKSPACE%" mkdir "%WORKSPACE%"
if not exist "%WORKSPACE%\data" mkdir "%WORKSPACE%\data"
if not exist "%WORKSPACE%\results" mkdir "%WORKSPACE%\results"
if not exist "%WORKSPACE%\scripts" mkdir "%WORKSPACE%\scripts"

REM Copy scripts if available
set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%..\insar_processor.py" (
    copy "%SCRIPT_DIR%..\insar_processor.py" "%WORKSPACE%\scripts\" >nul
    echo [INFO] Copied insar_processor.py
)

if exist "%SCRIPT_DIR%..\test_turkey_integration.py" (
    copy "%SCRIPT_DIR%..\test_turkey_integration.py" "%WORKSPACE%\scripts\" >nul
    echo [INFO] Copied test_turkey_integration.py
)

REM Create configuration file
(
echo # ASF (Alaska Satellite Facility) Credentials
echo # Register at: https://urs.earthdata.nasa.gov/users/new
echo ASF_USERNAME=your_username
echo ASF_PASSWORD=your_password
echo.
echo # Processing Parameters
echo RESOLUTION=180
echo GOLDSTEIN_PSIZE=16
echo.
echo # Output Directory
echo OUTPUT_DIR=%WORKSPACE%\results
) > "%WORKSPACE%\scripts\config.env"

REM Create run script
(
echo @echo off
echo REM InSAR Processing Run Script
echo REM.
echo echo ===============================================================================
echo echo   InSAR Processing
echo echo ===============================================================================
echo echo.
echo.
echo REM Activate Conda environment
echo call conda activate %CONDA_ENV%
echo.
echo set MODE=%%1
echo if "%%MODE%%"=="" set MODE=test
echo.
echo echo Mode: %%MODE%%
echo echo.
echo.
echo cd /d "%WORKSPACE%\scripts"
echo.
echo if "%%MODE%%"=="test" (
echo     python test_turkey_integration.py
echo ^) else if "%%MODE%%"=="full" (
echo     python test_turkey_integration.py --full
echo ^) else if "%%MODE%%"=="download" (
echo     python test_turkey_integration.py --download-only
echo ^) else (
echo     echo Usage: run_insar.bat [test^|full^|download]
echo ^)
echo.
echo echo.
echo pause
) > "%WORKSPACE%\run_insar.bat"

REM Create activation script
(
echo @echo off
echo REM Activate InSAR Conda Environment
echo call conda activate %CONDA_ENV%
echo cd /d "%WORKSPACE%"
echo cmd /k
) > "%WORKSPACE%\activate_env.bat"

echo [SUCCESS] Workspace created at %WORKSPACE%

REM ===============================================================================
REM Final Instructions
REM ===============================================================================

echo.
echo ===============================================================================
echo   Installation Complete!
echo ===============================================================================
echo.
echo Workspace directory: %WORKSPACE%
echo Conda environment: %CONDA_ENV%
echo.
echo Next steps:
echo   1. Configure ASF credentials in: %WORKSPACE%\scripts\config.env
echo   2. Run processing: %WORKSPACE%\run_insar.bat
echo   3. Or activate environment: %WORKSPACE%\activate_env.bat
echo.
echo NOTE: GMTSAR binaries (make_s1a_tops, etc.) are NOT available in Conda.
echo       For full GMTSAR support, use the WSL2 installation method.
echo       PyGMTSAR will work for data download and basic processing.
echo.
pause
