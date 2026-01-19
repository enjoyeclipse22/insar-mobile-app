"""
InSAR Processor Class - Encapsulated PyGMTSAR Processing

A well-structured Python class for InSAR processing using PyGMTSAR.
Supports parameterized configuration and provides callback hooks for progress tracking.

Author: InSAR Pro Mobile Team
Date: 2025-01-20
"""

import os
import sys
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Callable, Dict, Any, Tuple
from enum import Enum
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class ProcessingStep(Enum):
    """Enumeration of InSAR processing steps"""
    DOWNLOAD_DATA = "download_data"
    DOWNLOAD_DEM = "download_dem"
    DOWNLOAD_LANDMASK = "download_landmask"
    INITIALIZE_STACK = "initialize_stack"
    COMPUTE_ALIGNMENT = "compute_alignment"
    COMPUTE_GEOCODING = "compute_geocoding"
    COMPUTE_INTERFEROGRAM = "compute_interferogram"
    PHASE_UNWRAPPING = "phase_unwrapping"
    COMPUTE_DISPLACEMENT = "compute_displacement"
    GENERATE_VISUALIZATIONS = "generate_visualizations"


class ProcessingStatus(Enum):
    """Processing status enumeration"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ProcessingConfig:
    """Configuration for InSAR processing"""
    
    # ASF credentials
    asf_username: str = ""
    asf_password: str = ""
    
    # Processing region
    aoi: Optional[Tuple[float, float, float, float]] = None  # (lon_min, lat_min, lon_max, lat_max)
    
    # Epicenter locations (lat, lon)
    epicenters: List[Tuple[float, float]] = field(default_factory=list)
    
    # Burst IDs to process
    bursts: List[str] = field(default_factory=list)
    
    # Processing parameters
    polarization: str = "VV"
    orbit_direction: str = "D"  # D=Descending, A=Ascending
    resolution: float = 180.0  # meters
    
    # SNAPHU unwrapping parameters
    snaphu_tiles: Tuple[int, int] = (4, 4)  # (NTILEROW, NTILECOL)
    snaphu_overlap: Tuple[int, int] = (200, 200)  # (ROWOVRLP, COLOVRLP)
    
    # Goldstein filter parameters
    goldstein_psize: int = 32
    goldstein_alpha: float = 0.5
    
    # Gaussian filter wavelength for detrending (meters)
    detrend_wavelength: float = 300000
    
    # Output directories
    output_dir: str = "/tmp/insar_results"
    data_dir: str = ""  # Will be set based on output_dir
    work_dir: str = ""  # Will be set based on output_dir
    
    def __post_init__(self):
        """Initialize derived paths"""
        if not self.data_dir:
            self.data_dir = os.path.join(self.output_dir, "data")
        if not self.work_dir:
            self.work_dir = os.path.join(self.output_dir, "work")


@dataclass
class ProcessingResult:
    """Result of a processing step"""
    step: ProcessingStep
    status: ProcessingStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    output_files: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class InSARProcessor:
    """
    InSAR Processor using PyGMTSAR
    
    This class encapsulates the complete InSAR processing workflow including:
    - Sentinel-1 data download from ASF
    - DEM and Landmask download
    - Stack initialization and alignment
    - Interferogram computation
    - Phase unwrapping (SNAPHU)
    - Displacement computation
    - Visualization generation
    
    Example usage:
        config = ProcessingConfig(
            asf_username="your_username",
            asf_password="your_password",
            bursts=["S1_043817_IW2_20230210T033503_VV_E5B0-BURST", ...],
            epicenters=[(37.24, 38.11), (37.08, 37.17)],
            resolution=180.0,
            output_dir="/path/to/output"
        )
        
        processor = InSARProcessor(config)
        processor.on_progress(lambda step, progress, msg: print(f"{step}: {progress}% - {msg}"))
        processor.run()
    """
    
    def __init__(self, config: ProcessingConfig):
        """
        Initialize the InSAR processor
        
        Args:
            config: ProcessingConfig object with all processing parameters
        """
        self.config = config
        self.results: Dict[ProcessingStep, ProcessingResult] = {}
        self._progress_callbacks: List[Callable[[ProcessingStep, float, str], None]] = []
        self._log_callbacks: List[Callable[[str], None]] = []
        self._cancelled = False
        
        # PyGMTSAR objects (initialized during processing)
        self._sbas = None
        self._dem = None
        self._landmask = None
        self._intf = None
        self._corr = None
        self._unwrap = None
        
        # Ensure output directories exist
        os.makedirs(config.output_dir, exist_ok=True)
        os.makedirs(config.data_dir, exist_ok=True)
        os.makedirs(config.work_dir, exist_ok=True)
    
    def on_progress(self, callback: Callable[[ProcessingStep, float, str], None]):
        """
        Register a progress callback
        
        Args:
            callback: Function that receives (step, progress_percent, message)
        """
        self._progress_callbacks.append(callback)
    
    def on_log(self, callback: Callable[[str], None]):
        """
        Register a log callback
        
        Args:
            callback: Function that receives log messages
        """
        self._log_callbacks.append(callback)
    
    def cancel(self):
        """Cancel the processing"""
        self._cancelled = True
        self._log("Processing cancelled by user")
    
    def _log(self, message: str):
        """Log a message and notify callbacks"""
        logger.info(message)
        for callback in self._log_callbacks:
            try:
                callback(message)
            except Exception as e:
                logger.error(f"Log callback error: {e}")
    
    def _report_progress(self, step: ProcessingStep, progress: float, message: str):
        """Report progress to callbacks"""
        self._log(f"[{step.value}] {progress:.1f}% - {message}")
        for callback in self._progress_callbacks:
            try:
                callback(step, progress, message)
            except Exception as e:
                logger.error(f"Progress callback error: {e}")
    
    def _check_cancelled(self):
        """Check if processing was cancelled"""
        if self._cancelled:
            raise InterruptedError("Processing cancelled")
    
    def _start_step(self, step: ProcessingStep) -> ProcessingResult:
        """Start a processing step"""
        result = ProcessingResult(
            step=step,
            status=ProcessingStatus.RUNNING,
            start_time=datetime.now()
        )
        self.results[step] = result
        self._report_progress(step, 0, f"Starting {step.value}")
        return result
    
    def _complete_step(self, result: ProcessingResult, output_files: List[str] = None, 
                       metadata: Dict[str, Any] = None):
        """Complete a processing step successfully"""
        result.status = ProcessingStatus.COMPLETED
        result.end_time = datetime.now()
        if output_files:
            result.output_files = output_files
        if metadata:
            result.metadata = metadata
        self._report_progress(result.step, 100, f"Completed {result.step.value}")
    
    def _fail_step(self, result: ProcessingResult, error: str):
        """Mark a processing step as failed"""
        result.status = ProcessingStatus.FAILED
        result.end_time = datetime.now()
        result.error_message = error
        self._report_progress(result.step, -1, f"Failed: {error}")
    
    def download_data(self) -> ProcessingResult:
        """
        Download Sentinel-1 burst data from ASF
        
        Returns:
            ProcessingResult with download status and file paths
        """
        result = self._start_step(ProcessingStep.DOWNLOAD_DATA)
        
        try:
            self._check_cancelled()
            
            from pygmtsar import S1, ASF
            
            self._log(f"Downloading {len(self.config.bursts)} bursts from ASF...")
            
            # Parse burst IDs
            bursts = [b.strip() for b in self.config.bursts if b.strip()]
            
            if not bursts:
                raise ValueError("No burst IDs provided")
            
            # Check if data already exists
            existing_files = []
            if os.path.exists(self.config.data_dir):
                existing_safe = [f for f in os.listdir(self.config.data_dir) if f.endswith('.SAFE')]
                if len(existing_safe) >= 4:
                    # Check if xml files exist in SAFE directories
                    xml_files = []
                    for safe_dir in existing_safe:
                        safe_path = os.path.join(self.config.data_dir, safe_dir)
                        annot_dir = os.path.join(safe_path, 'annotation')
                        if os.path.exists(annot_dir):
                            xml_files.extend([f for f in os.listdir(annot_dir) if f.endswith('.xml')])
                    if len(xml_files) >= 4:
                        self._log(f"Data already downloaded: {len(existing_safe)} scenes found")
                        self._complete_step(result, existing_safe, {"scenes_count": len(existing_safe)})
                        return result
            
            os.makedirs(self.config.data_dir, exist_ok=True)
            
            # Download from ASF using correct API (matching turkey_insar_full.py)
            self._report_progress(ProcessingStep.DOWNLOAD_DATA, 10, "Authenticating with ASF...")
            
            # Initialize ASF client with credentials
            asf = ASF(self.config.asf_username, self.config.asf_password)
            
            # Download bursts one by one to avoid memory issues
            self._report_progress(ProcessingStep.DOWNLOAD_DATA, 20, "Downloading bursts...")
            download_result = asf.download(self.config.data_dir, bursts, n_jobs=1)
            
            self._report_progress(ProcessingStep.DOWNLOAD_DATA, 80, "Downloading orbit files...")
            
            # Download orbit files
            try:
                scenes = S1.scan_slc(self.config.data_dir)
                S1.download_orbits(self.config.data_dir, scenes)
            except Exception as e:
                self._log(f"Warning: Orbit download issue: {e}")
            
            downloaded_files = [f for f in os.listdir(self.config.data_dir) 
                               if f.endswith('.SAFE') or f.endswith('.zip')]
            
            self._complete_step(result, downloaded_files, {"scenes_count": len(downloaded_files)})
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def download_dem(self) -> ProcessingResult:
        """
        Download DEM data (Copernicus 3 arc-second)
        
        Returns:
            ProcessingResult with DEM file path
        """
        result = self._start_step(ProcessingStep.DOWNLOAD_DEM)
        
        try:
            self._check_cancelled()
            
            from pygmtsar import S1, Tiles
            
            self._log("Downloading Copernicus DEM (3 arc-second)...")
            
            dem_file = os.path.join(self.config.data_dir, 'dem.nc')
            
            # Check if DEM already exists
            if os.path.exists(dem_file):
                self._log("DEM already downloaded")
                self._complete_step(result, [dem_file])
                return result
            
            os.makedirs(self.config.data_dir, exist_ok=True)
            
            # Get AOI from scenes (matching turkey_insar_full.py)
            aoi = S1.scan_slc(self.config.data_dir)
            self._aoi = aoi
            
            self._report_progress(ProcessingStep.DOWNLOAD_DEM, 30, "Downloading DEM...")
            
            # Use Tiles class to download DEM (matching turkey_insar_full.py)
            dem = Tiles().download_dem(aoi, filename=dem_file, product='3s')
            self._dem = dem
            
            self._complete_step(result, [dem_file], {"dem_shape": str(dem.shape) if hasattr(dem, 'shape') else "unknown"})
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def download_landmask(self) -> ProcessingResult:
        """
        Download landmask data
        
        Returns:
            ProcessingResult with landmask file path
        """
        result = self._start_step(ProcessingStep.DOWNLOAD_LANDMASK)
        
        try:
            self._check_cancelled()
            
            from pygmtsar import S1, Tiles
            
            self._log("Downloading Landmask...")
            
            landmask_file = os.path.join(self.config.data_dir, 'landmask.nc')
            
            # Check if landmask already exists
            if os.path.exists(landmask_file):
                self._log("Landmask already downloaded")
                self._complete_step(result, [landmask_file])
                return result
            
            os.makedirs(self.config.data_dir, exist_ok=True)
            
            # Get AOI from scenes (matching turkey_insar_full.py)
            if not hasattr(self, '_aoi') or self._aoi is None:
                self._aoi = S1.scan_slc(self.config.data_dir)
            
            self._report_progress(ProcessingStep.DOWNLOAD_LANDMASK, 50, "Downloading landmask...")
            
            # Use Tiles class to download Landmask (matching turkey_insar_full.py)
            landmask = Tiles().download_landmask(self._aoi, filename=landmask_file, product='3s')
            self._landmask = landmask
            
            self._complete_step(result, [landmask_file])
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def initialize_stack(self) -> ProcessingResult:
        """
        Initialize the SBAS stack
        
        Returns:
            ProcessingResult with stack information
        """
        result = self._start_step(ProcessingStep.INITIALIZE_STACK)
        
        try:
            self._check_cancelled()
            
            from pygmtsar import S1, Stack
            
            self._log("Initializing Stack...")
            
            # Scan SLC data (matching turkey_insar_full.py)
            scenes = S1.scan_slc(self.config.data_dir)
            self._log(f"Found {len(scenes)} scenes")
            
            self._report_progress(ProcessingStep.INITIALIZE_STACK, 30, "Creating Stack object...")
            
            # Initialize Stack (matching turkey_insar_full.py)
            os.makedirs(self.config.work_dir, exist_ok=True)
            sbas = Stack(self.config.work_dir, drop_if_exists=True).set_scenes(scenes)
            self._sbas = sbas
            
            self._report_progress(ProcessingStep.INITIALIZE_STACK, 60, "Computing reframe...")
            
            # Compute reframe (matching turkey_insar_full.py)
            sbas.compute_reframe()
            
            self._complete_step(result, metadata={
                "scenes_count": len(scenes)
            })
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def compute_alignment(self) -> ProcessingResult:
        """
        Compute stack alignment
        
        Returns:
            ProcessingResult with alignment status
        """
        result = self._start_step(ProcessingStep.COMPUTE_ALIGNMENT)
        
        try:
            self._check_cancelled()
            
            if self._sbas is None:
                raise ValueError("Stack not initialized. Call initialize_stack() first.")
            
            dem_file = os.path.join(self.config.data_dir, 'dem.nc')
            
            self._log("Loading DEM...")
            self._report_progress(ProcessingStep.COMPUTE_ALIGNMENT, 10, "Loading DEM...")
            
            # Load DEM (matching turkey_insar_full.py)
            if not hasattr(self, '_aoi') or self._aoi is None:
                from pygmtsar import S1
                self._aoi = S1.scan_slc(self.config.data_dir)
            
            self._sbas.load_dem(dem_file, self._aoi)
            
            self._report_progress(ProcessingStep.COMPUTE_ALIGNMENT, 30, "Computing alignment...")
            
            # Compute alignment (matching turkey_insar_full.py)
            self._sbas.compute_align()
            
            self._complete_step(result)
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def compute_geocoding(self) -> ProcessingResult:
        """
        Compute geocoding transformation
        
        Returns:
            ProcessingResult with geocoding status
        """
        result = self._start_step(ProcessingStep.COMPUTE_GEOCODING)
        
        try:
            self._check_cancelled()
            
            if self._sbas is None:
                raise ValueError("Stack not initialized. Call initialize_stack() first.")
            
            self._log(f"Computing geocoding at {self.config.resolution}m resolution...")
            self._report_progress(ProcessingStep.COMPUTE_GEOCODING, 30, "Computing radar transform...")
            
            # Compute geocoding (matching turkey_insar_full.py)
            self._sbas.compute_geocode(self.config.resolution)
            
            self._complete_step(result, metadata={"resolution": self.config.resolution})
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def compute_interferogram(self) -> ProcessingResult:
        """
        Compute interferogram and correlation
        
        Returns:
            ProcessingResult with interferogram files
        """
        result = self._start_step(ProcessingStep.COMPUTE_INTERFEROGRAM)
        
        try:
            self._check_cancelled()
            
            import numpy as np
            
            if self._sbas is None:
                raise ValueError("Stack not initialized. Call initialize_stack() first.")
            
            self._log("Computing interferogram...")
            
            # Get pairs (matching turkey_insar_full.py)
            pairs = [self._sbas.to_dataframe().index.unique()]
            self._log(f"Processing pairs: {pairs}")
            
            # Load data (matching turkey_insar_full.py)
            topo = self._sbas.get_topo()
            data = self._sbas.open_data()
            self._topo = topo
            
            self._report_progress(ProcessingStep.COMPUTE_INTERFEROGRAM, 10, "Computing multilooking...")
            
            # Multilooking (matching turkey_insar_full.py)
            intensity_mlook = self._sbas.multilooking(np.square(np.abs(data)), wavelength=400, coarsen=(12, 48))
            
            self._report_progress(ProcessingStep.COMPUTE_INTERFEROGRAM, 30, "Computing phase difference...")
            
            # Phase difference (matching turkey_insar_full.py)
            phase = self._sbas.phasediff(pairs, data, topo)
            phase_mlook = self._sbas.multilooking(phase, wavelength=400, coarsen=(12, 48))
            
            self._report_progress(ProcessingStep.COMPUTE_INTERFEROGRAM, 50, "Computing correlation...")
            
            # Correlation (matching turkey_insar_full.py)
            corr_mlook = self._sbas.correlation(phase_mlook, intensity_mlook)
            
            self._report_progress(ProcessingStep.COMPUTE_INTERFEROGRAM, 70, "Applying Goldstein filter...")
            
            # Goldstein filter (matching turkey_insar_full.py)
            phase_mlook_goldstein = self._sbas.goldstein(phase_mlook, corr_mlook, self.config.goldstein_psize)
            
            self._report_progress(ProcessingStep.COMPUTE_INTERFEROGRAM, 85, "Computing final interferogram...")
            
            # Interferogram (matching turkey_insar_full.py)
            intf_mlook = self._sbas.interferogram(phase_mlook_goldstein)
            
            # Compute (using synchronous scheduler, matching turkey_insar_full.py)
            self._log("  Computing correlation and interferogram...")
            self._corr = corr_mlook[0].compute()
            self._log("    Correlation computed")
            self._intf = intf_mlook[0].compute()
            self._log("    Interferogram computed")
            
            # Geocode to geographic coordinates (matching turkey_insar_full.py)
            self._log("  Geocoding to geographic coordinates...")
            self._intf_ll = self._sbas.ra2ll(self._intf).compute()
            self._log("    Interferogram geocoded")
            self._corr_ll = self._sbas.ra2ll(self._corr).compute()
            self._log("    Correlation geocoded")
            
            self._complete_step(result)
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def phase_unwrapping(self) -> ProcessingResult:
        """
        Perform SNAPHU phase unwrapping
        
        Returns:
            ProcessingResult with unwrapped phase
        """
        result = self._start_step(ProcessingStep.PHASE_UNWRAPPING)
        
        try:
            self._check_cancelled()
            
            if self._sbas is None or self._intf is None:
                raise ValueError("Interferogram not computed. Call compute_interferogram() first.")
            
            self._log("Running SNAPHU phase unwrapping...")
            
            # Load landmask
            landmask_file = os.path.join(self.config.data_dir, 'landmask.nc')
            self._sbas.load_landmask(landmask_file)
            
            self._report_progress(ProcessingStep.PHASE_UNWRAPPING, 20, "Preparing landmask...")
            
            # Get landmask in radar coordinates
            intf_ll = self._sbas.ra2ll(self._intf)
            landmask_ll = self._sbas.get_landmask().reindex_like(intf_ll, method='nearest')
            landmask_ra = self._sbas.ll2ra(landmask_ll).reindex_like(self._intf, method='nearest')
            
            self._report_progress(ProcessingStep.PHASE_UNWRAPPING, 40, "Configuring SNAPHU...")
            
            # Configure SNAPHU
            conf = self._sbas.snaphu_config(
                defomax=None, 
                NTILEROW=self.config.snaphu_tiles[0], 
                NTILECOL=self.config.snaphu_tiles[1],
                ROWOVRLP=self.config.snaphu_overlap[0], 
                COLOVRLP=self.config.snaphu_overlap[1]
            )
            
            self._report_progress(ProcessingStep.PHASE_UNWRAPPING, 60, "Running SNAPHU...")
            
            # Run unwrapping
            unwrap = self._sbas.unwrap_snaphu(
                self._intf.where(landmask_ra), 
                self._corr, 
                conf=conf
            )
            
            self._unwrap = unwrap
            
            self._complete_step(result)
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def compute_displacement(self) -> ProcessingResult:
        """
        Compute LOS and projected displacements
        
        Returns:
            ProcessingResult with displacement data
        """
        result = self._start_step(ProcessingStep.COMPUTE_DISPLACEMENT)
        
        try:
            self._check_cancelled()
            
            if self._sbas is None or self._unwrap is None:
                raise ValueError("Phase unwrapping not completed. Call phase_unwrapping() first.")
            
            self._log("Computing displacements...")
            
            self._report_progress(ProcessingStep.COMPUTE_DISPLACEMENT, 20, "Detrending...")
            
            # Detrend
            detrend = self._unwrap.phase - self._sbas.gaussian(
                self._unwrap.phase, 
                wavelength=self.config.detrend_wavelength
            )
            
            if hasattr(detrend, 'compute'):
                detrend = detrend.compute()
            
            self._report_progress(ProcessingStep.COMPUTE_DISPLACEMENT, 40, "Computing LOS displacement...")
            
            # LOS displacement
            los_disp_mm = self._sbas.los_displacement_mm(detrend)
            los_disp_mm_ll = self._sbas.ra2ll(los_disp_mm)
            
            if hasattr(los_disp_mm_ll, 'compute'):
                los_disp_mm_ll = los_disp_mm_ll.compute()
            
            self._report_progress(ProcessingStep.COMPUTE_DISPLACEMENT, 60, "Computing vertical displacement...")
            
            # Vertical displacement
            vert_disp_mm = self._sbas.vertical_displacement_mm(detrend)
            vert_disp_mm_ll = self._sbas.ra2ll(vert_disp_mm)
            
            if hasattr(vert_disp_mm_ll, 'compute'):
                vert_disp_mm_ll = vert_disp_mm_ll.compute()
            
            self._report_progress(ProcessingStep.COMPUTE_DISPLACEMENT, 80, "Computing east-west displacement...")
            
            # East-West displacement
            east_disp_mm = self._sbas.eastwest_displacement_mm(detrend)
            east_disp_mm_ll = self._sbas.ra2ll(east_disp_mm)
            
            if hasattr(east_disp_mm_ll, 'compute'):
                east_disp_mm_ll = east_disp_mm_ll.compute()
            
            # Store results
            self._los_disp = los_disp_mm_ll
            self._vert_disp = vert_disp_mm_ll
            self._east_disp = east_disp_mm_ll
            
            self._complete_step(result, metadata={
                "los_min": float(los_disp_mm_ll.min()) if hasattr(los_disp_mm_ll, 'min') else None,
                "los_max": float(los_disp_mm_ll.max()) if hasattr(los_disp_mm_ll, 'max') else None
            })
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def generate_visualizations(self, output_prefix: str = "") -> ProcessingResult:
        """
        Generate all visualization images
        
        Args:
            output_prefix: Prefix for output filenames
            
        Returns:
            ProcessingResult with generated image paths
        """
        result = self._start_step(ProcessingStep.GENERATE_VISUALIZATIONS)
        output_files = []
        
        try:
            self._check_cancelled()
            
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            
            self._log("Generating visualizations...")
            
            # Generate DEM visualization
            self._report_progress(ProcessingStep.GENERATE_VISUALIZATIONS, 10, "Generating DEM plot...")
            dem_file = self._generate_dem_plot(output_prefix)
            if dem_file:
                output_files.append(dem_file)
            
            # Generate Landmask visualization
            self._report_progress(ProcessingStep.GENERATE_VISUALIZATIONS, 20, "Generating landmask plot...")
            landmask_file = self._generate_landmask_plot(output_prefix)
            if landmask_file:
                output_files.append(landmask_file)
            
            # Generate Phase visualization
            if self._intf is not None:
                self._report_progress(ProcessingStep.GENERATE_VISUALIZATIONS, 40, "Generating phase plot...")
                phase_file = self._generate_phase_plot(output_prefix)
                if phase_file:
                    output_files.append(phase_file)
            
            # Generate Correlation visualization
            if self._corr is not None:
                self._report_progress(ProcessingStep.GENERATE_VISUALIZATIONS, 50, "Generating correlation plot...")
                corr_file = self._generate_correlation_plot(output_prefix)
                if corr_file:
                    output_files.append(corr_file)
            
            # Generate Displacement visualizations
            if hasattr(self, '_los_disp') and self._los_disp is not None:
                self._report_progress(ProcessingStep.GENERATE_VISUALIZATIONS, 70, "Generating displacement plots...")
                disp_files = self._generate_displacement_plots(output_prefix)
                output_files.extend(disp_files)
            
            self._complete_step(result, output_files)
            
        except Exception as e:
            self._fail_step(result, str(e))
            raise
        
        return result
    
    def _generate_dem_plot(self, prefix: str) -> Optional[str]:
        """Generate DEM visualization"""
        try:
            import matplotlib.pyplot as plt
            import xarray as xr
            
            dem_file = os.path.join(self.config.data_dir, 'dem.nc')
            if not os.path.exists(dem_file):
                return None
            
            dem = xr.open_dataarray(dem_file)
            
            fig, ax = plt.subplots(figsize=(10, 8))
            dem.plot.imshow(ax=ax, cmap='terrain', add_colorbar=True, 
                           cbar_kwargs={'label': 'Elevation [m]'})
            
            # Plot epicenters
            for lat, lon in self.config.epicenters:
                ax.plot(lon, lat, 'r*', markersize=15, label='Epicenter')
            
            ax.set_xlabel('Longitude')
            ax.set_ylabel('Latitude')
            ax.set_title('DEM with Epicenters')
            
            output_path = os.path.join(self.config.output_dir, f'{prefix}01_dem.png')
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            return output_path
            
        except Exception as e:
            self._log(f"Warning: Failed to generate DEM plot: {e}")
            return None
    
    def _generate_landmask_plot(self, prefix: str) -> Optional[str]:
        """Generate landmask visualization"""
        try:
            import matplotlib.pyplot as plt
            import xarray as xr
            
            landmask_file = os.path.join(self.config.data_dir, 'landmask.nc')
            if not os.path.exists(landmask_file):
                return None
            
            landmask = xr.open_dataarray(landmask_file)
            
            fig, ax = plt.subplots(figsize=(10, 8))
            landmask.plot.imshow(ax=ax, cmap='binary', add_colorbar=True,
                                cbar_kwargs={'label': 'Land (1) / Water (0)'})
            
            ax.set_xlabel('Longitude')
            ax.set_ylabel('Latitude')
            ax.set_title('Landmask')
            
            output_path = os.path.join(self.config.output_dir, f'{prefix}02_landmask.png')
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            return output_path
            
        except Exception as e:
            self._log(f"Warning: Failed to generate landmask plot: {e}")
            return None
    
    def _generate_phase_plot(self, prefix: str) -> Optional[str]:
        """Generate wrapped phase visualization"""
        try:
            import matplotlib.pyplot as plt
            import numpy as np
            
            if self._intf is None:
                return None
            
            intf_ll = self._sbas.ra2ll(self._intf)
            if hasattr(intf_ll, 'compute'):
                intf_ll = intf_ll.compute()
            
            fig, ax = plt.subplots(figsize=(10, 8))
            
            phase = np.angle(intf_ll) if np.iscomplexobj(intf_ll) else intf_ll
            
            im = ax.imshow(phase, cmap='hsv', vmin=-np.pi, vmax=np.pi)
            plt.colorbar(im, ax=ax, label='Phase [rad]')
            
            ax.set_title('Wrapped Interferogram Phase')
            
            output_path = os.path.join(self.config.output_dir, f'{prefix}03_phase.png')
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            return output_path
            
        except Exception as e:
            self._log(f"Warning: Failed to generate phase plot: {e}")
            return None
    
    def _generate_correlation_plot(self, prefix: str) -> Optional[str]:
        """Generate correlation visualization"""
        try:
            import matplotlib.pyplot as plt
            
            if self._corr is None:
                return None
            
            corr_ll = self._sbas.ra2ll(self._corr)
            if hasattr(corr_ll, 'compute'):
                corr_ll = corr_ll.compute()
            
            fig, ax = plt.subplots(figsize=(10, 8))
            
            corr_ll.plot.imshow(ax=ax, cmap='gray', vmin=0, vmax=1, add_colorbar=True,
                               cbar_kwargs={'label': 'Correlation'})
            
            ax.set_xlabel('Longitude')
            ax.set_ylabel('Latitude')
            ax.set_title('Interferometric Correlation')
            
            output_path = os.path.join(self.config.output_dir, f'{prefix}04_correlation.png')
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            return output_path
            
        except Exception as e:
            self._log(f"Warning: Failed to generate correlation plot: {e}")
            return None
    
    def _generate_displacement_plots(self, prefix: str) -> List[str]:
        """Generate displacement visualizations"""
        output_files = []
        
        try:
            import matplotlib.pyplot as plt
            
            # LOS displacement
            if hasattr(self, '_los_disp') and self._los_disp is not None:
                fig, ax = plt.subplots(figsize=(10, 8))
                
                vmin = float(self._los_disp.quantile(0.01))
                vmax = float(self._los_disp.quantile(0.99))
                
                self._los_disp.plot.imshow(ax=ax, cmap='jet', vmin=vmin, vmax=vmax,
                                          add_colorbar=True, cbar_kwargs={'label': 'LOS Displacement [mm]'})
                
                for lat, lon in self.config.epicenters:
                    ax.plot(lon, lat, 'r*', markersize=15)
                
                ax.set_xlabel('Longitude')
                ax.set_ylabel('Latitude')
                ax.set_title('LOS Displacement')
                
                output_path = os.path.join(self.config.output_dir, f'{prefix}07_los_displacement.png')
                plt.savefig(output_path, dpi=150, bbox_inches='tight')
                plt.close()
                output_files.append(output_path)
            
            # Vertical displacement
            if hasattr(self, '_vert_disp') and self._vert_disp is not None:
                fig, ax = plt.subplots(figsize=(10, 8))
                
                vmin = float(self._vert_disp.quantile(0.01))
                vmax = float(self._vert_disp.quantile(0.99))
                
                self._vert_disp.plot.imshow(ax=ax, cmap='jet', vmin=vmin, vmax=vmax,
                                           add_colorbar=True, cbar_kwargs={'label': 'Vertical Displacement [mm]'})
                
                ax.set_xlabel('Longitude')
                ax.set_ylabel('Latitude')
                ax.set_title('Vertical Displacement')
                
                output_path = os.path.join(self.config.output_dir, f'{prefix}08_vertical_displacement.png')
                plt.savefig(output_path, dpi=150, bbox_inches='tight')
                plt.close()
                output_files.append(output_path)
            
            # East-West displacement
            if hasattr(self, '_east_disp') and self._east_disp is not None:
                fig, ax = plt.subplots(figsize=(10, 8))
                
                vmin = float(self._east_disp.quantile(0.01))
                vmax = float(self._east_disp.quantile(0.99))
                
                self._east_disp.plot.imshow(ax=ax, cmap='jet', vmin=vmin, vmax=vmax,
                                           add_colorbar=True, cbar_kwargs={'label': 'East-West Displacement [mm]'})
                
                ax.set_xlabel('Longitude')
                ax.set_ylabel('Latitude')
                ax.set_title('East-West Displacement')
                
                output_path = os.path.join(self.config.output_dir, f'{prefix}09_eastwest_displacement.png')
                plt.savefig(output_path, dpi=150, bbox_inches='tight')
                plt.close()
                output_files.append(output_path)
            
        except Exception as e:
            self._log(f"Warning: Failed to generate displacement plots: {e}")
        
        return output_files
    
    def run(self, steps: Optional[List[ProcessingStep]] = None) -> Dict[ProcessingStep, ProcessingResult]:
        """
        Run the complete InSAR processing workflow
        
        Args:
            steps: Optional list of steps to run. If None, runs all steps.
            
        Returns:
            Dictionary of processing results for each step
        """
        if steps is None:
            steps = [
                ProcessingStep.DOWNLOAD_DATA,
                ProcessingStep.DOWNLOAD_DEM,
                ProcessingStep.DOWNLOAD_LANDMASK,
                ProcessingStep.INITIALIZE_STACK,
                ProcessingStep.COMPUTE_ALIGNMENT,
                ProcessingStep.COMPUTE_GEOCODING,
                ProcessingStep.COMPUTE_INTERFEROGRAM,
                ProcessingStep.PHASE_UNWRAPPING,
                ProcessingStep.COMPUTE_DISPLACEMENT,
                ProcessingStep.GENERATE_VISUALIZATIONS
            ]
        
        self._log("=" * 60)
        self._log("Starting InSAR Processing")
        self._log("=" * 60)
        self._log(f"Output directory: {self.config.output_dir}")
        self._log(f"Resolution: {self.config.resolution}m")
        self._log(f"Bursts: {len(self.config.bursts)}")
        
        step_methods = {
            ProcessingStep.DOWNLOAD_DATA: self.download_data,
            ProcessingStep.DOWNLOAD_DEM: self.download_dem,
            ProcessingStep.DOWNLOAD_LANDMASK: self.download_landmask,
            ProcessingStep.INITIALIZE_STACK: self.initialize_stack,
            ProcessingStep.COMPUTE_ALIGNMENT: self.compute_alignment,
            ProcessingStep.COMPUTE_GEOCODING: self.compute_geocoding,
            ProcessingStep.COMPUTE_INTERFEROGRAM: self.compute_interferogram,
            ProcessingStep.PHASE_UNWRAPPING: self.phase_unwrapping,
            ProcessingStep.COMPUTE_DISPLACEMENT: self.compute_displacement,
            ProcessingStep.GENERATE_VISUALIZATIONS: self.generate_visualizations
        }
        
        for step in steps:
            if self._cancelled:
                self._log("Processing cancelled")
                break
            
            if step in step_methods:
                try:
                    step_methods[step]()
                except Exception as e:
                    self._log(f"Step {step.value} failed: {e}")
                    if step not in [ProcessingStep.GENERATE_VISUALIZATIONS]:
                        # Non-critical steps can continue
                        raise
        
        self._log("=" * 60)
        self._log("Processing Complete")
        self._log("=" * 60)
        
        return self.results
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current processing status
        
        Returns:
            Dictionary with status information
        """
        completed = sum(1 for r in self.results.values() if r.status == ProcessingStatus.COMPLETED)
        failed = sum(1 for r in self.results.values() if r.status == ProcessingStatus.FAILED)
        
        return {
            "total_steps": len(ProcessingStep),
            "completed_steps": completed,
            "failed_steps": failed,
            "cancelled": self._cancelled,
            "results": {
                step.value: {
                    "status": result.status.value,
                    "start_time": result.start_time.isoformat() if result.start_time else None,
                    "end_time": result.end_time.isoformat() if result.end_time else None,
                    "output_files": result.output_files,
                    "error": result.error_message
                }
                for step, result in self.results.items()
            }
        }


# Factory function for creating processor with common configurations
def create_turkey_earthquake_processor(
    asf_username: str,
    asf_password: str,
    output_dir: str = "/tmp/turkey_insar",
    resolution: float = 180.0
) -> InSARProcessor:
    """
    Create a processor configured for Turkey 2023 earthquake data
    
    Args:
        asf_username: ASF username
        asf_password: ASF password
        output_dir: Output directory
        resolution: Processing resolution in meters
        
    Returns:
        Configured InSARProcessor instance
    """
    config = ProcessingConfig(
        asf_username=asf_username,
        asf_password=asf_password,
        bursts=[
            "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
            "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
            "S1_043818_IW2_20230210T033506_VV_E5B0-BURST",
            "S1_043818_IW2_20230129T033507_VV_BE0B-BURST"
        ],
        epicenters=[
            (37.24, 38.11),  # Mw 7.8 epicenter
            (37.08, 37.17)   # Mw 7.5 epicenter
        ],
        polarization="VV",
        orbit_direction="D",
        resolution=resolution,
        output_dir=output_dir
    )
    
    return InSARProcessor(config)


if __name__ == "__main__":
    # Example usage
    import argparse
    
    parser = argparse.ArgumentParser(description="InSAR Processing with PyGMTSAR")
    parser.add_argument("--asf-username", required=True, help="ASF username")
    parser.add_argument("--asf-password", required=True, help="ASF password")
    parser.add_argument("--output-dir", default="/tmp/insar_results", help="Output directory")
    parser.add_argument("--resolution", type=float, default=180.0, help="Resolution in meters")
    
    args = parser.parse_args()
    
    # Create processor for Turkey earthquake
    processor = create_turkey_earthquake_processor(
        asf_username=args.asf_username,
        asf_password=args.asf_password,
        output_dir=args.output_dir,
        resolution=args.resolution
    )
    
    # Add progress callback
    def on_progress(step, progress, message):
        print(f"[{step.value}] {progress:.1f}% - {message}")
    
    processor.on_progress(on_progress)
    
    # Run processing
    try:
        results = processor.run()
        print("\nProcessing completed!")
        print(processor.get_status())
    except Exception as e:
        print(f"\nProcessing failed: {e}")
