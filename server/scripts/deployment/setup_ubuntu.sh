#!/bin/bash
#===============================================================================
# PyGMTSAR InSAR Processing Environment Setup Script for Ubuntu
# 
# This script installs all dependencies required to run InSAR processing
# including GMTSAR, PyGMTSAR, and all Python dependencies.
#
# Tested on: Ubuntu 20.04, 22.04, 24.04
# Requirements: sudo privileges, internet connection
# Estimated time: 15-30 minutes
#
# Usage:
#   chmod +x setup_ubuntu.sh
#   ./setup_ubuntu.sh
#
# Author: InSAR Pro Team
# Version: 1.0.0
#===============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GMTSAR_VERSION="6.5"
PYTHON_MIN_VERSION="3.9"
INSTALL_DIR="/usr/local"
WORK_DIR="$HOME/insar_workspace"

#===============================================================================
# Helper Functions
#===============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

#===============================================================================
# System Check
#===============================================================================

echo ""
echo "==============================================================================="
echo "  PyGMTSAR InSAR Processing Environment Setup"
echo "  Ubuntu Server Installation Script"
echo "==============================================================================="
echo ""

log_info "Checking system requirements..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_warning "Running as root. Some operations may behave differently."
fi

# Check Ubuntu version
if [ -f /etc/os-release ]; then
    . /etc/os-release
    log_info "Detected OS: $NAME $VERSION"
else
    log_warning "Could not detect OS version"
fi

# Check available disk space (need at least 10GB)
AVAILABLE_SPACE=$(df -BG "$HOME" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 10 ]; then
    log_warning "Low disk space: ${AVAILABLE_SPACE}GB available. Recommended: 10GB+"
fi

# Check RAM (need at least 8GB for processing)
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
log_info "Available RAM: ${TOTAL_RAM}GB"
if [ "$TOTAL_RAM" -lt 8 ]; then
    log_warning "Low RAM: ${TOTAL_RAM}GB. Recommended: 8GB+ for InSAR processing"
fi

#===============================================================================
# Step 1: Update System and Install Basic Dependencies
#===============================================================================

echo ""
log_info "Step 1/6: Installing system dependencies..."

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update -qq

# Essential build tools
sudo apt-get install -y -qq \
    build-essential \
    cmake \
    autoconf \
    automake \
    libtool \
    pkg-config \
    git \
    wget \
    curl \
    unzip

# GMTSAR dependencies
sudo apt-get install -y -qq \
    gmt \
    gmt-dcw \
    gmt-gshhg \
    libgmt-dev \
    libgmt6 \
    libnetcdf-dev \
    libfftw3-dev \
    liblapack-dev \
    libblas-dev \
    libhdf5-dev \
    tcsh \
    csh \
    gfortran \
    gcc-9 \
    g++-9

# Python dependencies
sudo apt-get install -y -qq \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv

# Additional utilities
sudo apt-get install -y -qq \
    gdal-bin \
    libgdal-dev \
    imagemagick \
    ghostscript

log_success "System dependencies installed"

#===============================================================================
# Step 2: Install GMTSAR
#===============================================================================

echo ""
log_info "Step 2/6: Installing GMTSAR..."

if check_command make_s1a_tops; then
    log_info "GMTSAR already installed, skipping..."
else
    cd "$INSTALL_DIR"
    
    # Clone GMTSAR
    if [ ! -d "$INSTALL_DIR/GMTSAR" ]; then
        sudo git clone --depth=1 -q --branch master https://github.com/gmtsar/gmtsar.git GMTSAR
    fi
    
    cd GMTSAR
    
    # Configure and compile
    log_info "Configuring GMTSAR..."
    sudo autoconf
    sudo ./configure --with-orbits-dir=/usr/local/orbits
    
    log_info "Compiling GMTSAR (this may take 5-10 minutes)..."
    sudo make -j$(nproc)
    sudo make install
    
    log_success "GMTSAR compiled and installed"
fi

# Add GMTSAR to PATH
GMTSAR_PATH="$INSTALL_DIR/GMTSAR/bin"
if ! grep -q "GMTSAR" "$HOME/.bashrc"; then
    echo "" >> "$HOME/.bashrc"
    echo "# GMTSAR Environment" >> "$HOME/.bashrc"
    echo "export PATH=\$PATH:$GMTSAR_PATH" >> "$HOME/.bashrc"
    echo "export GMTSAR_HOME=$INSTALL_DIR/GMTSAR" >> "$HOME/.bashrc"
fi

export PATH=$PATH:$GMTSAR_PATH

log_success "GMTSAR installed at $GMTSAR_PATH"

#===============================================================================
# Step 3: Install Python Environment
#===============================================================================

echo ""
log_info "Step 3/6: Setting up Python environment..."

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
log_info "Python version: $PYTHON_VERSION"

# Upgrade pip
sudo pip3 install --upgrade pip setuptools wheel

log_success "Python environment ready"

#===============================================================================
# Step 4: Install PyGMTSAR and Dependencies
#===============================================================================

echo ""
log_info "Step 4/6: Installing PyGMTSAR and Python dependencies..."

# Install PyGMTSAR
sudo pip3 install pygmtsar

# Install additional dependencies
sudo pip3 install \
    numpy \
    scipy \
    pandas \
    xarray \
    dask[complete] \
    distributed \
    matplotlib \
    cartopy \
    netCDF4 \
    h5py \
    rasterio \
    shapely \
    geopandas \
    asf_search \
    requests \
    tqdm \
    pytest

log_success "PyGMTSAR and dependencies installed"

#===============================================================================
# Step 5: Create Workspace Directory
#===============================================================================

echo ""
log_info "Step 5/6: Creating workspace directory..."

mkdir -p "$WORK_DIR"
mkdir -p "$WORK_DIR/data"
mkdir -p "$WORK_DIR/results"
mkdir -p "$WORK_DIR/scripts"

log_success "Workspace created at $WORK_DIR"

#===============================================================================
# Step 6: Copy Processing Scripts
#===============================================================================

echo ""
log_info "Step 6/6: Setting up processing scripts..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy processing scripts if they exist
if [ -f "$SCRIPT_DIR/../insar_processor.py" ]; then
    cp "$SCRIPT_DIR/../insar_processor.py" "$WORK_DIR/scripts/"
    log_info "Copied insar_processor.py"
fi

if [ -f "$SCRIPT_DIR/../test_turkey_integration.py" ]; then
    cp "$SCRIPT_DIR/../test_turkey_integration.py" "$WORK_DIR/scripts/"
    log_info "Copied test_turkey_integration.py"
fi

# Create a sample configuration file
cat > "$WORK_DIR/scripts/config.env" << 'EOF'
# ASF (Alaska Satellite Facility) Credentials
# Register at: https://urs.earthdata.nasa.gov/users/new
ASF_USERNAME=your_username
ASF_PASSWORD=your_password

# Processing Parameters
RESOLUTION=180
GOLDSTEIN_PSIZE=16

# Output Directory
OUTPUT_DIR=$HOME/insar_workspace/results
EOF

log_success "Processing scripts configured"

#===============================================================================
# Verification
#===============================================================================

echo ""
echo "==============================================================================="
echo "  Installation Verification"
echo "==============================================================================="
echo ""

# Verify installations
ERRORS=0

if check_command gmt; then
    GMT_VERSION=$(gmt --version)
    log_success "GMT installed: $GMT_VERSION"
else
    log_error "GMT not found"
    ERRORS=$((ERRORS + 1))
fi

if check_command make_s1a_tops; then
    log_success "GMTSAR installed"
else
    log_error "GMTSAR not found"
    ERRORS=$((ERRORS + 1))
fi

if python3 -c "import pygmtsar" 2>/dev/null; then
    PYGMTSAR_VERSION=$(python3 -c "import pygmtsar; print(pygmtsar.__version__)" 2>/dev/null || echo "unknown")
    log_success "PyGMTSAR installed: $PYGMTSAR_VERSION"
else
    log_error "PyGMTSAR not found"
    ERRORS=$((ERRORS + 1))
fi

if python3 -c "import dask" 2>/dev/null; then
    log_success "Dask installed"
else
    log_error "Dask not found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "==============================================================================="
    log_success "Installation completed successfully!"
    echo "==============================================================================="
    echo ""
    echo "Next steps:"
    echo "  1. Reload your shell: source ~/.bashrc"
    echo "  2. Configure ASF credentials in: $WORK_DIR/scripts/config.env"
    echo "  3. Run the test script:"
    echo "     cd $WORK_DIR/scripts"
    echo "     python3 test_turkey_integration.py"
    echo ""
    echo "Workspace directory: $WORK_DIR"
    echo ""
else
    echo "==============================================================================="
    log_error "Installation completed with $ERRORS errors"
    echo "==============================================================================="
    echo ""
    echo "Please check the error messages above and try again."
    echo ""
fi

#===============================================================================
# Create Run Script
#===============================================================================

cat > "$WORK_DIR/run_insar.sh" << 'RUNSCRIPT'
#!/bin/bash
#===============================================================================
# InSAR Processing Run Script
#===============================================================================

# Load environment
source ~/.bashrc
export PATH=$PATH:/usr/local/GMTSAR/bin

# Load configuration
if [ -f "$(dirname "$0")/scripts/config.env" ]; then
    source "$(dirname "$0")/scripts/config.env"
fi

# Default values
SCRIPT_DIR="$(dirname "$0")/scripts"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/insar_workspace/results}"

# Parse arguments
REGION="${1:-turkey}"
MODE="${2:-test}"

echo "==============================================================================="
echo "  InSAR Processing"
echo "==============================================================================="
echo "Region: $REGION"
echo "Mode: $MODE"
echo "Output: $OUTPUT_DIR"
echo "==============================================================================="

cd "$SCRIPT_DIR"

case "$MODE" in
    test)
        echo "Running integration tests..."
        python3 test_turkey_integration.py
        ;;
    full)
        echo "Running full processing..."
        python3 test_turkey_integration.py --full
        ;;
    download)
        echo "Downloading data only..."
        python3 test_turkey_integration.py --download-only
        ;;
    *)
        echo "Usage: $0 [region] [mode]"
        echo "  region: turkey (default)"
        echo "  mode: test, full, download"
        ;;
esac
RUNSCRIPT

chmod +x "$WORK_DIR/run_insar.sh"

log_success "Run script created at $WORK_DIR/run_insar.sh"
