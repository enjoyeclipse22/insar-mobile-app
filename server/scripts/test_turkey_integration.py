"""
Integration Test for Turkey Earthquake InSAR Processing

This test script validates the InSARProcessor class by running the complete
processing workflow with real ASF credentials and Turkey earthquake parameters.

The test replicates the functionality of turkey_insar_full.py but uses the
encapsulated InSARProcessor class through the insar_service module.

Author: InSAR Pro Mobile Team
Date: 2025-01-20
"""

import os
import sys
import time
import logging
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from insar_processor import (
    InSARProcessor,
    ProcessingConfig,
    ProcessingStep,
    ProcessingStatus,
    create_turkey_earthquake_processor
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# Test Configuration - Matching turkey_insar_full.py
# =============================================================================

# Real ASF credentials
ASF_USERNAME = "kanezeng"
ASF_PASSWORD = "#@!xiaoBOBO123"

# Turkey earthquake epicenters (Mw 7.8 & 7.5, 2023-02-06)
EPICENTERS = [(37.24, 38.11), (37.08, 37.17)]

# Burst IDs for processing (same as turkey_insar_full.py)
BURSTS = [
    "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
    "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
    "S1_043818_IW2_20230210T033506_VV_E5B0-BURST",
    "S1_043818_IW2_20230129T033507_VV_BE0B-BURST"
]

# Processing parameters (same as turkey_insar_full.py)
RESOLUTION = 500.0  # meters (using lower resolution for memory constraints)
POLARIZATION = "VV"
ORBIT_DIRECTION = "D"

# Output directory
OUTPUT_DIR = "/home/ubuntu/turkey_insar_results"


class IntegrationTestRunner:
    """
    Integration test runner that validates the InSARProcessor class
    against the original turkey_insar_full.py functionality.
    """
    
    def __init__(self):
        self.test_results = {}
        self.processor = None
        self.start_time = None
        self.logs = []
    
    def log(self, message: str):
        """Log a message with timestamp"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_entry = f"[{timestamp}] {message}"
        print(log_entry)
        self.logs.append(log_entry)
    
    def on_progress(self, step: ProcessingStep, progress: float, message: str):
        """Progress callback handler"""
        self.log(f"  [{step.value}] {progress:.1f}% - {message}")
    
    def on_log(self, message: str):
        """Log callback handler"""
        self.logs.append(message)
    
    def test_configuration_matching(self):
        """
        Test 1: Verify configuration matches turkey_insar_full.py
        """
        self.log("=" * 60)
        self.log("Test 1: Configuration Matching")
        self.log("=" * 60)
        
        try:
            # Create configuration
            config = ProcessingConfig(
                asf_username=ASF_USERNAME,
                asf_password=ASF_PASSWORD,
                bursts=BURSTS,
                epicenters=EPICENTERS,
                polarization=POLARIZATION,
                orbit_direction=ORBIT_DIRECTION,
                resolution=RESOLUTION,
                output_dir=OUTPUT_DIR
            )
            
            # Verify configuration
            assert config.asf_username == "kanezeng", "ASF username mismatch"
            assert config.asf_password == "#@!xiaoBOBO123", "ASF password mismatch"
            assert len(config.bursts) == 4, f"Expected 4 bursts, got {len(config.bursts)}"
            assert len(config.epicenters) == 2, f"Expected 2 epicenters, got {len(config.epicenters)}"
            assert config.polarization == "VV", "Polarization mismatch"
            assert config.orbit_direction == "D", "Orbit direction mismatch"
            assert config.resolution == 500.0, "Resolution mismatch"
            
            # Verify burst IDs match
            expected_bursts = [
                "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
                "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
                "S1_043818_IW2_20230210T033506_VV_E5B0-BURST",
                "S1_043818_IW2_20230129T033507_VV_BE0B-BURST"
            ]
            for burst in expected_bursts:
                assert burst in config.bursts, f"Missing burst: {burst}"
            
            # Verify epicenters match
            assert (37.24, 38.11) in config.epicenters, "Missing Mw 7.8 epicenter"
            assert (37.08, 37.17) in config.epicenters, "Missing Mw 7.5 epicenter"
            
            # Verify derived paths
            assert config.data_dir == f"{OUTPUT_DIR}/data", "Data dir mismatch"
            assert config.work_dir == f"{OUTPUT_DIR}/work", "Work dir mismatch"
            
            self.log("  ✓ ASF credentials configured correctly")
            self.log("  ✓ 4 burst IDs configured correctly")
            self.log("  ✓ 2 epicenters configured correctly")
            self.log("  ✓ Processing parameters match turkey_insar_full.py")
            self.log("  ✓ Output directories configured correctly")
            
            self.test_results["configuration_matching"] = "PASSED"
            return True
            
        except AssertionError as e:
            self.log(f"  ✗ Configuration test failed: {e}")
            self.test_results["configuration_matching"] = f"FAILED: {e}"
            return False
        except Exception as e:
            self.log(f"  ✗ Unexpected error: {e}")
            self.test_results["configuration_matching"] = f"ERROR: {e}"
            return False
    
    def test_processor_initialization(self):
        """
        Test 2: Verify processor initialization
        """
        self.log("=" * 60)
        self.log("Test 2: Processor Initialization")
        self.log("=" * 60)
        
        try:
            # Create processor using factory function (same as turkey_insar_full.py)
            self.processor = create_turkey_earthquake_processor(
                asf_username=ASF_USERNAME,
                asf_password=ASF_PASSWORD,
                output_dir=OUTPUT_DIR,
                resolution=RESOLUTION
            )
            
            # Verify processor is created
            assert self.processor is not None, "Processor is None"
            assert isinstance(self.processor, InSARProcessor), "Not an InSARProcessor instance"
            
            # Verify processor configuration
            assert self.processor.config.asf_username == ASF_USERNAME, "Username mismatch"
            assert self.processor.config.resolution == RESOLUTION, "Resolution mismatch"
            assert len(self.processor.config.bursts) == 4, "Burst count mismatch"
            
            # Verify callbacks can be registered
            self.processor.on_progress(self.on_progress)
            self.processor.on_log(self.on_log)
            
            assert len(self.processor._progress_callbacks) == 1, "Progress callback not registered"
            assert len(self.processor._log_callbacks) == 1, "Log callback not registered"
            
            self.log("  ✓ Processor created successfully")
            self.log("  ✓ Configuration matches turkey_insar_full.py")
            self.log("  ✓ Progress callback registered")
            self.log("  ✓ Log callback registered")
            
            self.test_results["processor_initialization"] = "PASSED"
            return True
            
        except AssertionError as e:
            self.log(f"  ✗ Initialization test failed: {e}")
            self.test_results["processor_initialization"] = f"FAILED: {e}"
            return False
        except Exception as e:
            self.log(f"  ✗ Unexpected error: {e}")
            self.test_results["processor_initialization"] = f"ERROR: {e}"
            return False
    
    def test_processing_steps_definition(self):
        """
        Test 3: Verify all processing steps are defined (matching turkey_insar_full.py)
        """
        self.log("=" * 60)
        self.log("Test 3: Processing Steps Definition")
        self.log("=" * 60)
        
        try:
            # Expected steps from turkey_insar_full.py
            expected_steps = [
                ("download_data", "Step 1: Downloading Sentinel-1 data from ASF"),
                ("download_dem", "Step 2: Downloading DEM"),
                ("download_landmask", "Step 2: Downloading Landmask"),
                ("initialize_stack", "Step 3: Processing interferogram - Stack init"),
                ("compute_alignment", "Step 3: Processing interferogram - Alignment"),
                ("compute_geocoding", "Step 3: Processing interferogram - Geocoding"),
                ("compute_interferogram", "Step 3: Processing interferogram - Compute"),
                ("phase_unwrapping", "Step 4: Phase unwrapping (SNAPHU)"),
                ("compute_displacement", "Step 5: Computing displacements"),
                ("generate_visualizations", "Generate visualizations")
            ]
            
            # Verify all steps exist in ProcessingStep enum
            for step_value, description in expected_steps:
                step = ProcessingStep(step_value)
                assert step is not None, f"Step {step_value} not found"
                self.log(f"  ✓ {step_value}: {description}")
            
            # Verify step count
            assert len(ProcessingStep) == 10, f"Expected 10 steps, got {len(ProcessingStep)}"
            
            self.log("  ✓ All 10 processing steps defined correctly")
            
            self.test_results["processing_steps_definition"] = "PASSED"
            return True
            
        except Exception as e:
            self.log(f"  ✗ Steps definition test failed: {e}")
            self.test_results["processing_steps_definition"] = f"FAILED: {e}"
            return False
    
    def test_data_download(self):
        """
        Test 4: Test data download step (with real ASF credentials)
        """
        self.log("=" * 60)
        self.log("Test 4: Data Download (Real ASF Credentials)")
        self.log("=" * 60)
        
        if self.processor is None:
            self.log("  ✗ Processor not initialized, skipping test")
            self.test_results["data_download"] = "SKIPPED"
            return False
        
        try:
            self.log("  Starting data download...")
            self.log(f"  ASF Username: {ASF_USERNAME}")
            self.log(f"  Number of bursts: {len(BURSTS)}")
            
            # Run download step
            result = self.processor.download_data()
            
            # Verify result
            assert result is not None, "Download result is None"
            assert result.step == ProcessingStep.DOWNLOAD_DATA, "Wrong step"
            
            if result.status == ProcessingStatus.COMPLETED:
                self.log(f"  ✓ Download completed successfully")
                self.log(f"  ✓ Output files: {len(result.output_files)}")
                self.test_results["data_download"] = "PASSED"
                return True
            else:
                self.log(f"  ✗ Download failed: {result.error_message}")
                self.test_results["data_download"] = f"FAILED: {result.error_message}"
                return False
            
        except Exception as e:
            self.log(f"  ✗ Download test failed: {e}")
            self.test_results["data_download"] = f"ERROR: {e}"
            return False
    
    def test_dem_download(self):
        """
        Test 5: Test DEM download step
        """
        self.log("=" * 60)
        self.log("Test 5: DEM Download")
        self.log("=" * 60)
        
        if self.processor is None:
            self.log("  ✗ Processor not initialized, skipping test")
            self.test_results["dem_download"] = "SKIPPED"
            return False
        
        try:
            self.log("  Starting DEM download...")
            
            # Run DEM download step
            result = self.processor.download_dem()
            
            # Verify result
            assert result is not None, "DEM download result is None"
            assert result.step == ProcessingStep.DOWNLOAD_DEM, "Wrong step"
            
            if result.status == ProcessingStatus.COMPLETED:
                self.log(f"  ✓ DEM download completed successfully")
                self.log(f"  ✓ Output files: {result.output_files}")
                self.test_results["dem_download"] = "PASSED"
                return True
            else:
                self.log(f"  ✗ DEM download failed: {result.error_message}")
                self.test_results["dem_download"] = f"FAILED: {result.error_message}"
                return False
            
        except Exception as e:
            self.log(f"  ✗ DEM download test failed: {e}")
            self.test_results["dem_download"] = f"ERROR: {e}"
            return False
    
    def test_landmask_download(self):
        """
        Test 6: Test Landmask download step
        """
        self.log("=" * 60)
        self.log("Test 6: Landmask Download")
        self.log("=" * 60)
        
        if self.processor is None:
            self.log("  ✗ Processor not initialized, skipping test")
            self.test_results["landmask_download"] = "SKIPPED"
            return False
        
        try:
            self.log("  Starting Landmask download...")
            
            # Run Landmask download step
            result = self.processor.download_landmask()
            
            # Verify result
            assert result is not None, "Landmask download result is None"
            assert result.step == ProcessingStep.DOWNLOAD_LANDMASK, "Wrong step"
            
            if result.status == ProcessingStatus.COMPLETED:
                self.log(f"  ✓ Landmask download completed successfully")
                self.log(f"  ✓ Output files: {result.output_files}")
                self.test_results["landmask_download"] = "PASSED"
                return True
            else:
                self.log(f"  ✗ Landmask download failed: {result.error_message}")
                self.test_results["landmask_download"] = f"FAILED: {result.error_message}"
                return False
            
        except Exception as e:
            self.log(f"  ✗ Landmask download test failed: {e}")
            self.test_results["landmask_download"] = f"ERROR: {e}"
            return False
    
    def test_visualization_generation(self):
        """
        Test 7: Test visualization generation (DEM and Landmask plots)
        """
        self.log("=" * 60)
        self.log("Test 7: Visualization Generation")
        self.log("=" * 60)
        
        if self.processor is None:
            self.log("  ✗ Processor not initialized, skipping test")
            self.test_results["visualization_generation"] = "SKIPPED"
            return False
        
        try:
            self.log("  Generating visualizations...")
            
            # Check if DEM and Landmask files exist
            dem_file = os.path.join(OUTPUT_DIR, "data", "dem.nc")
            landmask_file = os.path.join(OUTPUT_DIR, "data", "landmask.nc")
            
            if not os.path.exists(dem_file):
                self.log(f"  ✗ DEM file not found: {dem_file}")
                self.test_results["visualization_generation"] = "SKIPPED: DEM not downloaded"
                return False
            
            # Generate visualizations
            result = self.processor.generate_visualizations(output_prefix="test_")
            
            if result.status == ProcessingStatus.COMPLETED:
                self.log(f"  ✓ Visualizations generated successfully")
                for f in result.output_files:
                    self.log(f"    - {f}")
                self.test_results["visualization_generation"] = "PASSED"
                return True
            else:
                self.log(f"  ✗ Visualization generation failed: {result.error_message}")
                self.test_results["visualization_generation"] = f"FAILED: {result.error_message}"
                return False
            
        except Exception as e:
            self.log(f"  ✗ Visualization test failed: {e}")
            self.test_results["visualization_generation"] = f"ERROR: {e}"
            return False
    
    def test_status_reporting(self):
        """
        Test 8: Test status reporting functionality
        """
        self.log("=" * 60)
        self.log("Test 8: Status Reporting")
        self.log("=" * 60)
        
        if self.processor is None:
            self.log("  ✗ Processor not initialized, skipping test")
            self.test_results["status_reporting"] = "SKIPPED"
            return False
        
        try:
            # Get status
            status = self.processor.get_status()
            
            # Verify status structure
            assert "total_steps" in status, "Missing total_steps"
            assert "completed_steps" in status, "Missing completed_steps"
            assert "failed_steps" in status, "Missing failed_steps"
            assert "cancelled" in status, "Missing cancelled"
            assert "results" in status, "Missing results"
            
            self.log(f"  ✓ Total steps: {status['total_steps']}")
            self.log(f"  ✓ Completed steps: {status['completed_steps']}")
            self.log(f"  ✓ Failed steps: {status['failed_steps']}")
            self.log(f"  ✓ Cancelled: {status['cancelled']}")
            
            self.test_results["status_reporting"] = "PASSED"
            return True
            
        except Exception as e:
            self.log(f"  ✗ Status reporting test failed: {e}")
            self.test_results["status_reporting"] = f"ERROR: {e}"
            return False
    
    def run_all_tests(self, run_download_tests: bool = True):
        """
        Run all integration tests
        
        Args:
            run_download_tests: Whether to run tests that require network access
        """
        self.start_time = datetime.now()
        
        self.log("=" * 60)
        self.log("Turkey Earthquake InSAR Processing - Integration Tests")
        self.log("=" * 60)
        self.log(f"Start time: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        self.log(f"Output directory: {OUTPUT_DIR}")
        self.log("")
        
        # Run tests
        tests = [
            ("Configuration Matching", self.test_configuration_matching),
            ("Processor Initialization", self.test_processor_initialization),
            ("Processing Steps Definition", self.test_processing_steps_definition),
            ("Status Reporting", self.test_status_reporting),
        ]
        
        # Add download tests if requested
        if run_download_tests:
            tests.extend([
                ("Data Download", self.test_data_download),
                ("DEM Download", self.test_dem_download),
                ("Landmask Download", self.test_landmask_download),
                ("Visualization Generation", self.test_visualization_generation),
            ])
        
        passed = 0
        failed = 0
        skipped = 0
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                if result:
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                self.log(f"Test '{test_name}' raised exception: {e}")
                failed += 1
            self.log("")
        
        # Print summary
        end_time = datetime.now()
        duration = (end_time - self.start_time).total_seconds()
        
        self.log("=" * 60)
        self.log("Test Summary")
        self.log("=" * 60)
        self.log(f"Total tests: {len(tests)}")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        self.log(f"Duration: {duration:.2f} seconds")
        self.log("")
        
        self.log("Test Results:")
        for test_name, result in self.test_results.items():
            status_icon = "✓" if "PASSED" in result else "✗"
            self.log(f"  {status_icon} {test_name}: {result}")
        
        self.log("")
        self.log("=" * 60)
        
        return passed, failed


def main():
    """Main entry point for integration tests"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Turkey Earthquake InSAR Integration Tests")
    parser.add_argument("--skip-download", action="store_true", 
                       help="Skip tests that require network access")
    parser.add_argument("--full", action="store_true",
                       help="Run full processing workflow (may take hours)")
    
    args = parser.parse_args()
    
    # Create test runner
    runner = IntegrationTestRunner()
    
    # Run tests
    if args.full:
        # Run full processing workflow
        print("Running full processing workflow...")
        print("This may take several hours depending on network speed and system resources.")
        print("")
        
        # Create processor
        processor = create_turkey_earthquake_processor(
            asf_username=ASF_USERNAME,
            asf_password=ASF_PASSWORD,
            output_dir=OUTPUT_DIR,
            resolution=RESOLUTION
        )
        
        # Add callbacks
        def on_progress(step, progress, message):
            print(f"[{step.value}] {progress:.1f}% - {message}")
        
        processor.on_progress(on_progress)
        
        # Run all steps
        try:
            results = processor.run()
            print("\nProcessing completed!")
            print(processor.get_status())
        except Exception as e:
            print(f"\nProcessing failed: {e}")
    else:
        # Run integration tests
        passed, failed = runner.run_all_tests(run_download_tests=not args.skip_download)
        
        # Exit with appropriate code
        sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
