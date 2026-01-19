@echo off
REM ===============================================================================
REM PyGMTSAR InSAR Processing Environment Setup Script for Windows
REM 
REM This script sets up the InSAR processing environment on Windows using WSL2
REM (Windows Subsystem for Linux 2) which provides the best compatibility.
REM 
REM Requirements:
REM   - Windows 10 version 2004+ or Windows 11
REM   - Administrator privileges
REM   - Internet connection
REM 
REM Usage:
REM   Right-click and "Run as Administrator"
REM   Or: setup_windows.bat
REM 
REM Author: InSAR Pro Team
REM Version: 1.0.0
REM ===============================================================================

setlocal EnableDelayedExpansion

echo.
echo ===============================================================================
echo   PyGMTSAR InSAR Processing Environment Setup
echo   Windows Installation Script (WSL2 Method)
echo ===============================================================================
echo.

REM Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges.
    echo         Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

echo [INFO] Running with Administrator privileges...
echo.

REM ===============================================================================
REM Step 1: Check Windows Version
REM ===============================================================================

echo [INFO] Step 1/5: Checking Windows version...

for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo [INFO] Windows version: %VERSION%

REM ===============================================================================
REM Step 2: Enable WSL2
REM ===============================================================================

echo.
echo [INFO] Step 2/5: Enabling WSL2...

REM Enable WSL feature
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart >nul 2>&1
if %errorLevel% equ 0 (
    echo [SUCCESS] WSL feature enabled
) else (
    echo [INFO] WSL feature already enabled or requires restart
)

REM Enable Virtual Machine Platform
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart >nul 2>&1
if %errorLevel% equ 0 (
    echo [SUCCESS] Virtual Machine Platform enabled
) else (
    echo [INFO] Virtual Machine Platform already enabled or requires restart
)

REM Set WSL2 as default
wsl --set-default-version 2 >nul 2>&1

echo [INFO] WSL2 configuration complete

REM ===============================================================================
REM Step 3: Install Ubuntu
REM ===============================================================================

echo.
echo [INFO] Step 3/5: Installing Ubuntu on WSL2...

REM Check if Ubuntu is already installed
wsl -l -q 2>nul | findstr /i "Ubuntu" >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Ubuntu already installed on WSL2
) else (
    echo [INFO] Installing Ubuntu... This may take several minutes.
    wsl --install -d Ubuntu
    if %errorLevel% neq 0 (
        echo [WARNING] Automatic installation failed. Please install manually:
        echo           1. Open Microsoft Store
        echo           2. Search for "Ubuntu"
        echo           3. Install "Ubuntu 22.04 LTS"
    )
)

REM ===============================================================================
REM Step 4: Create Setup Script for WSL
REM ===============================================================================

echo.
echo [INFO] Step 4/5: Creating WSL setup script...

set SCRIPT_DIR=%~dp0
set WSL_SCRIPT=%TEMP%\setup_wsl_insar.sh

REM Create the WSL setup script
(
echo #!/bin/bash
echo # WSL InSAR Environment Setup Script
echo # This script runs inside WSL Ubuntu
echo.
echo set -e
echo.
echo echo "==============================================================================="
echo echo "  Setting up InSAR environment in WSL Ubuntu"
echo echo "==============================================================================="
echo echo ""
echo.
echo # Update system
echo echo "[INFO] Updating system packages..."
echo sudo apt-get update -qq
echo sudo apt-get upgrade -y -qq
echo.
echo # Install dependencies
echo echo "[INFO] Installing dependencies..."
echo sudo apt-get install -y -qq \
echo     build-essential cmake autoconf automake libtool pkg-config \
echo     git wget curl unzip \
echo     gmt gmt-dcw gmt-gshhg libgmt-dev libgmt6 \
echo     libnetcdf-dev libfftw3-dev liblapack-dev libblas-dev libhdf5-dev \
echo     tcsh csh gfortran gcc-9 g++-9 \
echo     python3 python3-pip python3-dev python3-venv \
echo     gdal-bin libgdal-dev
echo.
echo # Install GMTSAR
echo echo "[INFO] Installing GMTSAR..."
echo if [ ! -d "/usr/local/GMTSAR" ]; then
echo     cd /usr/local
echo     sudo git clone --depth=1 -q --branch master https://github.com/gmtsar/gmtsar.git GMTSAR
echo     cd GMTSAR
echo     sudo autoconf
echo     sudo ./configure --with-orbits-dir=/usr/local/orbits
echo     sudo make -j$(nproc^)
echo     sudo make install
echo fi
echo.
echo # Add to PATH
echo if ! grep -q "GMTSAR" ~/.bashrc; then
echo     echo 'export PATH=$PATH:/usr/local/GMTSAR/bin' ^>^> ~/.bashrc
echo     echo 'export GMTSAR_HOME=/usr/local/GMTSAR' ^>^> ~/.bashrc
echo fi
echo.
echo # Install Python packages
echo echo "[INFO] Installing Python packages..."
echo sudo pip3 install --upgrade pip
echo sudo pip3 install pygmtsar numpy scipy pandas xarray dask matplotlib
echo.
echo # Create workspace
echo mkdir -p ~/insar_workspace/{data,results,scripts}
echo.
echo echo ""
echo echo "==============================================================================="
echo echo "  Installation Complete!"
echo echo "==============================================================================="
echo echo ""
echo echo "To use InSAR processing:"
echo echo "  1. Open WSL: wsl"
echo echo "  2. Navigate to workspace: cd ~/insar_workspace"
echo echo "  3. Run processing scripts"
echo echo ""
) > "%WSL_SCRIPT%"

echo [SUCCESS] WSL setup script created

REM ===============================================================================
REM Step 5: Create Windows Shortcuts and Batch Files
REM ===============================================================================

echo.
echo [INFO] Step 5/5: Creating Windows shortcuts...

set WORKSPACE=%USERPROFILE%\insar_workspace
if not exist "%WORKSPACE%" mkdir "%WORKSPACE%"
if not exist "%WORKSPACE%\scripts" mkdir "%WORKSPACE%\scripts"

REM Create run script
(
echo @echo off
echo REM InSAR Processing Run Script for Windows
echo REM This script launches the InSAR processing in WSL
echo.
echo echo ===============================================================================
echo echo   InSAR Processing ^(via WSL^)
echo echo ===============================================================================
echo echo.
echo.
echo set MODE=%%1
echo if "%%MODE%%"=="" set MODE=test
echo.
echo echo Running InSAR processing in WSL...
echo echo Mode: %%MODE%%
echo echo.
echo.
echo wsl bash -c "source ~/.bashrc && cd ~/insar_workspace/scripts && python3 test_turkey_integration.py"
echo.
echo echo.
echo echo Processing complete.
echo pause
) > "%WORKSPACE%\run_insar.bat"

REM Create WSL launcher
(
echo @echo off
echo REM Launch WSL with InSAR environment
echo wsl bash -c "source ~/.bashrc && cd ~/insar_workspace && exec bash"
) > "%WORKSPACE%\open_wsl.bat"

echo [SUCCESS] Windows scripts created in %WORKSPACE%

REM ===============================================================================
REM Final Instructions
REM ===============================================================================

echo.
echo ===============================================================================
echo   Installation Summary
echo ===============================================================================
echo.
echo [SUCCESS] Windows setup complete!
echo.
echo IMPORTANT: You may need to restart your computer for WSL2 to work properly.
echo.
echo Next steps:
echo   1. Restart your computer (if WSL2 was just enabled)
echo   2. Open Command Prompt and run: wsl
echo   3. Complete Ubuntu first-time setup (create username/password)
echo   4. Run the WSL setup script:
echo      wsl bash %WSL_SCRIPT:\=/%
echo   5. Or manually run: wsl bash /mnt/c/path/to/setup_ubuntu.sh
echo.
echo Workspace directory: %WORKSPACE%
echo.
echo To run InSAR processing:
echo   - Double-click: %WORKSPACE%\run_insar.bat
echo   - Or open WSL: %WORKSPACE%\open_wsl.bat
echo.
pause
