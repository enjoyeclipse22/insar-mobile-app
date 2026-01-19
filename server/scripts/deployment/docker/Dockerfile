#===============================================================================
# PyGMTSAR InSAR Processing Environment
# Multi-stage Docker Build
#
# This Dockerfile creates a complete InSAR processing environment with:
# - GMT (Generic Mapping Tools)
# - GMTSAR (GMT-based SAR processing)
# - PyGMTSAR (Python wrapper)
# - All required dependencies
#
# Build: docker build -t pygmtsar-insar .
# Run:   docker run -it --rm -v $(pwd)/data:/data pygmtsar-insar
#
# Author: InSAR Pro Team
# Version: 1.0.0
#===============================================================================

# Stage 1: Build GMTSAR
FROM ubuntu:22.04 AS gmtsar-builder

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    autoconf \
    automake \
    libtool \
    pkg-config \
    git \
    wget \
    gmt \
    libgmt-dev \
    libnetcdf-dev \
    libfftw3-dev \
    liblapack-dev \
    libblas-dev \
    libhdf5-dev \
    tcsh \
    csh \
    gfortran \
    && rm -rf /var/lib/apt/lists/*

# Clone and build GMTSAR
WORKDIR /usr/local
RUN git clone --depth=1 --branch master https://github.com/gmtsar/gmtsar.git GMTSAR

WORKDIR /usr/local/GMTSAR
RUN autoconf && \
    ./configure --with-orbits-dir=/usr/local/orbits && \
    make -j$(nproc) && \
    make install

#===============================================================================
# Stage 2: Final Runtime Image
#===============================================================================
FROM ubuntu:22.04

LABEL maintainer="InSAR Pro Team"
LABEL description="PyGMTSAR InSAR Processing Environment"
LABEL version="1.0.0"

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # GMT and dependencies
    gmt \
    gmt-dcw \
    gmt-gshhg \
    libgmt6 \
    libnetcdf19 \
    libfftw3-3 \
    liblapack3 \
    libblas3 \
    libhdf5-103-1 \
    # Shell tools
    tcsh \
    csh \
    # Python
    python3 \
    python3-pip \
    python3-dev \
    # GDAL
    gdal-bin \
    libgdal30 \
    # Utilities
    wget \
    curl \
    git \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Copy GMTSAR from builder stage
COPY --from=gmtsar-builder /usr/local/GMTSAR /usr/local/GMTSAR

# Set environment variables
ENV PATH="/usr/local/GMTSAR/bin:${PATH}"
ENV GMTSAR_HOME="/usr/local/GMTSAR"
ENV PYTHONUNBUFFERED=1

# Upgrade pip and install Python packages
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Install PyGMTSAR and dependencies
RUN pip3 install --no-cache-dir \
    pygmtsar \
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
    pytest \
    fastapi \
    uvicorn

# Create workspace directories
RUN mkdir -p /workspace/data /workspace/results /workspace/scripts /workspace/logs

# Copy processing scripts
COPY insar_processor.py /workspace/scripts/
COPY test_turkey_integration.py /workspace/scripts/
COPY insar_service.py /workspace/scripts/

# Create entrypoint script
RUN echo '#!/bin/bash\n\
echo "==============================================================================="\n\
echo "  PyGMTSAR InSAR Processing Environment"\n\
echo "==============================================================================="\n\
echo ""\n\
echo "Environment:"\n\
echo "  - GMT: $(gmt --version)"\n\
echo "  - GMTSAR: $(make_s1a_tops 2>&1 | head -1 || echo "installed")"\n\
echo "  - PyGMTSAR: $(python3 -c "import pygmtsar; print(pygmtsar.__version__)" 2>/dev/null || echo "installed")"\n\
echo "  - Python: $(python3 --version)"\n\
echo ""\n\
echo "Workspace: /workspace"\n\
echo "  - /workspace/data     - Input data directory"\n\
echo "  - /workspace/results  - Output results directory"\n\
echo "  - /workspace/scripts  - Processing scripts"\n\
echo ""\n\
echo "Usage:"\n\
echo "  Run tests:     python3 /workspace/scripts/test_turkey_integration.py"\n\
echo "  Start API:     python3 /workspace/scripts/insar_service.py"\n\
echo "  Interactive:   bash"\n\
echo ""\n\
echo "==============================================================================="\n\
\n\
exec "$@"\n' > /entrypoint.sh && chmod +x /entrypoint.sh

# Set working directory
WORKDIR /workspace

# Expose API port
EXPOSE 8000

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Default command
CMD ["bash"]
