"""
Unit Tests for InSAR Processor Class

Tests the InSARProcessor class with Turkey 2023 earthquake parameters.
Validates configuration, initialization, and processing steps.

Author: InSAR Pro Mobile Team
Date: 2025-01-20
"""

import os
import sys
import unittest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from typing import List

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from insar_processor import (
    InSARProcessor,
    ProcessingConfig,
    ProcessingStep,
    ProcessingStatus,
    ProcessingResult,
    create_turkey_earthquake_processor
)


class TestProcessingConfig(unittest.TestCase):
    """Test cases for ProcessingConfig dataclass"""
    
    def test_default_config(self):
        """Test default configuration values"""
        config = ProcessingConfig()
        
        self.assertEqual(config.polarization, "VV")
        self.assertEqual(config.orbit_direction, "D")
        self.assertEqual(config.resolution, 180.0)
        self.assertEqual(config.snaphu_tiles, (4, 4))
        self.assertEqual(config.snaphu_overlap, (200, 200))
        self.assertEqual(config.goldstein_psize, 32)
        self.assertEqual(config.goldstein_alpha, 0.5)
        self.assertEqual(config.detrend_wavelength, 300000)
    
    def test_custom_config(self):
        """Test custom configuration values"""
        config = ProcessingConfig(
            asf_username="test_user",
            asf_password="test_pass",
            resolution=360.0,
            polarization="VH",
            orbit_direction="A",
            output_dir="/custom/output"
        )
        
        self.assertEqual(config.asf_username, "test_user")
        self.assertEqual(config.asf_password, "test_pass")
        self.assertEqual(config.resolution, 360.0)
        self.assertEqual(config.polarization, "VH")
        self.assertEqual(config.orbit_direction, "A")
        self.assertEqual(config.output_dir, "/custom/output")
    
    def test_derived_paths(self):
        """Test that derived paths are correctly set"""
        config = ProcessingConfig(output_dir="/test/output")
        
        self.assertEqual(config.data_dir, "/test/output/data")
        self.assertEqual(config.work_dir, "/test/output/work")
    
    def test_turkey_earthquake_config(self):
        """Test Turkey earthquake specific configuration"""
        config = ProcessingConfig(
            bursts=[
                "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
                "S1_043817_IW2_20230129T033504_VV_BE0B-BURST"
            ],
            epicenters=[
                (37.24, 38.11),
                (37.08, 37.17)
            ]
        )
        
        self.assertEqual(len(config.bursts), 2)
        self.assertEqual(len(config.epicenters), 2)
        self.assertEqual(config.epicenters[0], (37.24, 38.11))
        self.assertEqual(config.epicenters[1], (37.08, 37.17))


class TestProcessingStep(unittest.TestCase):
    """Test cases for ProcessingStep enum"""
    
    def test_all_steps_defined(self):
        """Test that all expected processing steps are defined"""
        expected_steps = [
            "download_data",
            "download_dem",
            "download_landmask",
            "initialize_stack",
            "compute_alignment",
            "compute_geocoding",
            "compute_interferogram",
            "phase_unwrapping",
            "compute_displacement",
            "generate_visualizations"
        ]
        
        actual_steps = [step.value for step in ProcessingStep]
        
        for expected in expected_steps:
            self.assertIn(expected, actual_steps)
    
    def test_step_count(self):
        """Test total number of processing steps"""
        self.assertEqual(len(ProcessingStep), 10)


class TestProcessingStatus(unittest.TestCase):
    """Test cases for ProcessingStatus enum"""
    
    def test_all_statuses_defined(self):
        """Test that all expected statuses are defined"""
        expected_statuses = ["pending", "running", "completed", "failed", "cancelled"]
        actual_statuses = [status.value for status in ProcessingStatus]
        
        for expected in expected_statuses:
            self.assertIn(expected, actual_statuses)


class TestProcessingResult(unittest.TestCase):
    """Test cases for ProcessingResult dataclass"""
    
    def test_result_creation(self):
        """Test creating a processing result"""
        result = ProcessingResult(
            step=ProcessingStep.DOWNLOAD_DATA,
            status=ProcessingStatus.RUNNING,
            start_time=datetime.now()
        )
        
        self.assertEqual(result.step, ProcessingStep.DOWNLOAD_DATA)
        self.assertEqual(result.status, ProcessingStatus.RUNNING)
        self.assertIsNotNone(result.start_time)
        self.assertIsNone(result.end_time)
        self.assertEqual(result.output_files, [])
        self.assertIsNone(result.error_message)
    
    def test_result_with_output(self):
        """Test result with output files"""
        result = ProcessingResult(
            step=ProcessingStep.GENERATE_VISUALIZATIONS,
            status=ProcessingStatus.COMPLETED,
            start_time=datetime.now(),
            end_time=datetime.now(),
            output_files=["/path/to/dem.png", "/path/to/phase.png"]
        )
        
        self.assertEqual(len(result.output_files), 2)
        self.assertIn("/path/to/dem.png", result.output_files)
    
    def test_result_with_error(self):
        """Test result with error message"""
        result = ProcessingResult(
            step=ProcessingStep.DOWNLOAD_DATA,
            status=ProcessingStatus.FAILED,
            start_time=datetime.now(),
            error_message="Connection timeout"
        )
        
        self.assertEqual(result.status, ProcessingStatus.FAILED)
        self.assertEqual(result.error_message, "Connection timeout")


class TestInSARProcessor(unittest.TestCase):
    """Test cases for InSARProcessor class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.config = ProcessingConfig(
            asf_username="test_user",
            asf_password="test_pass",
            bursts=[
                "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
                "S1_043817_IW2_20230129T033504_VV_BE0B-BURST"
            ],
            epicenters=[(37.24, 38.11), (37.08, 37.17)],
            resolution=180.0,
            output_dir="/tmp/test_insar"
        )
    
    def test_processor_initialization(self):
        """Test processor initialization"""
        processor = InSARProcessor(self.config)
        
        self.assertEqual(processor.config.asf_username, "test_user")
        self.assertEqual(processor.config.resolution, 180.0)
        self.assertEqual(len(processor.config.bursts), 2)
        self.assertEqual(len(processor.results), 0)
        self.assertFalse(processor._cancelled)
    
    def test_progress_callback_registration(self):
        """Test registering progress callbacks"""
        processor = InSARProcessor(self.config)
        
        callback_called = []
        
        def progress_callback(step, progress, message):
            callback_called.append((step, progress, message))
        
        processor.on_progress(progress_callback)
        
        self.assertEqual(len(processor._progress_callbacks), 1)
    
    def test_log_callback_registration(self):
        """Test registering log callbacks"""
        processor = InSARProcessor(self.config)
        
        logs = []
        
        def log_callback(message):
            logs.append(message)
        
        processor.on_log(log_callback)
        
        self.assertEqual(len(processor._log_callbacks), 1)
    
    def test_cancel_processing(self):
        """Test cancelling processing"""
        processor = InSARProcessor(self.config)
        
        self.assertFalse(processor._cancelled)
        
        processor.cancel()
        
        self.assertTrue(processor._cancelled)
    
    def test_get_status_empty(self):
        """Test getting status with no results"""
        processor = InSARProcessor(self.config)
        
        status = processor.get_status()
        
        self.assertEqual(status["total_steps"], 10)
        self.assertEqual(status["completed_steps"], 0)
        self.assertEqual(status["failed_steps"], 0)
        self.assertFalse(status["cancelled"])
        self.assertEqual(len(status["results"]), 0)
    
    def test_start_step(self):
        """Test starting a processing step"""
        processor = InSARProcessor(self.config)
        
        result = processor._start_step(ProcessingStep.DOWNLOAD_DATA)
        
        self.assertEqual(result.step, ProcessingStep.DOWNLOAD_DATA)
        self.assertEqual(result.status, ProcessingStatus.RUNNING)
        self.assertIsNotNone(result.start_time)
        self.assertIn(ProcessingStep.DOWNLOAD_DATA, processor.results)
    
    def test_complete_step(self):
        """Test completing a processing step"""
        processor = InSARProcessor(self.config)
        
        result = processor._start_step(ProcessingStep.DOWNLOAD_DATA)
        processor._complete_step(result, output_files=["file1.nc", "file2.nc"])
        
        self.assertEqual(result.status, ProcessingStatus.COMPLETED)
        self.assertIsNotNone(result.end_time)
        self.assertEqual(len(result.output_files), 2)
    
    def test_fail_step(self):
        """Test failing a processing step"""
        processor = InSARProcessor(self.config)
        
        result = processor._start_step(ProcessingStep.DOWNLOAD_DATA)
        processor._fail_step(result, "Test error message")
        
        self.assertEqual(result.status, ProcessingStatus.FAILED)
        self.assertIsNotNone(result.end_time)
        self.assertEqual(result.error_message, "Test error message")


class TestTurkeyEarthquakeFactory(unittest.TestCase):
    """Test cases for Turkey earthquake factory function"""
    
    def test_create_turkey_processor(self):
        """Test creating Turkey earthquake processor"""
        processor = create_turkey_earthquake_processor(
            asf_username="test_user",
            asf_password="test_pass",
            output_dir="/tmp/turkey_test",
            resolution=360.0
        )
        
        self.assertIsInstance(processor, InSARProcessor)
        self.assertEqual(processor.config.asf_username, "test_user")
        self.assertEqual(processor.config.resolution, 360.0)
        self.assertEqual(len(processor.config.bursts), 4)
        self.assertEqual(len(processor.config.epicenters), 2)
    
    def test_turkey_bursts_correct(self):
        """Test that Turkey earthquake bursts are correctly configured"""
        processor = create_turkey_earthquake_processor(
            asf_username="test",
            asf_password="test"
        )
        
        expected_bursts = [
            "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
            "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
            "S1_043818_IW2_20230210T033506_VV_E5B0-BURST",
            "S1_043818_IW2_20230129T033507_VV_BE0B-BURST"
        ]
        
        for burst in expected_bursts:
            self.assertIn(burst, processor.config.bursts)
    
    def test_turkey_epicenters_correct(self):
        """Test that Turkey earthquake epicenters are correctly configured"""
        processor = create_turkey_earthquake_processor(
            asf_username="test",
            asf_password="test"
        )
        
        # Mw 7.8 epicenter
        self.assertIn((37.24, 38.11), processor.config.epicenters)
        # Mw 7.5 epicenter
        self.assertIn((37.08, 37.17), processor.config.epicenters)


class TestTurkeyEarthquakeParameters(unittest.TestCase):
    """Integration tests with real Turkey earthquake parameters"""
    
    def test_turkey_config_validation(self):
        """Test that Turkey earthquake configuration is valid"""
        config = ProcessingConfig(
            asf_username="kanezeng",
            asf_password="test_password",
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
            resolution=180.0,
            output_dir="/home/ubuntu/turkey_insar_results"
        )
        
        # Validate burst format
        for burst in config.bursts:
            self.assertTrue(burst.startswith("S1_"))
            self.assertIn("IW2", burst)
            self.assertIn("VV", burst)
            self.assertTrue(burst.endswith("-BURST"))
        
        # Validate epicenter coordinates (Turkey region)
        for lat, lon in config.epicenters:
            self.assertGreater(lat, 36.0)  # South of Turkey
            self.assertLess(lat, 42.0)     # North of Turkey
            self.assertGreater(lon, 26.0)  # West of Turkey
            self.assertLess(lon, 45.0)     # East of Turkey
        
        # Validate dates in bursts (2023-01-29 and 2023-02-10)
        dates_found = set()
        for burst in config.bursts:
            if "20230129" in burst:
                dates_found.add("2023-01-29")
            if "20230210" in burst:
                dates_found.add("2023-02-10")
        
        self.assertEqual(len(dates_found), 2)
        self.assertIn("2023-01-29", dates_found)  # Pre-earthquake
        self.assertIn("2023-02-10", dates_found)  # Post-earthquake
    
    def test_processor_with_turkey_params(self):
        """Test processor initialization with Turkey parameters"""
        processor = create_turkey_earthquake_processor(
            asf_username="kanezeng",
            asf_password="#@!xiaoBOBO123",
            output_dir="/home/ubuntu/turkey_insar_results",
            resolution=180.0
        )
        
        # Verify processor is correctly configured
        self.assertEqual(processor.config.polarization, "VV")
        self.assertEqual(processor.config.orbit_direction, "D")
        self.assertEqual(processor.config.resolution, 180.0)
        
        # Verify paths
        self.assertEqual(processor.config.output_dir, "/home/ubuntu/turkey_insar_results")
        self.assertEqual(processor.config.data_dir, "/home/ubuntu/turkey_insar_results/data")
        self.assertEqual(processor.config.work_dir, "/home/ubuntu/turkey_insar_results/work")
    
    def test_progress_tracking(self):
        """Test progress tracking with callbacks"""
        processor = create_turkey_earthquake_processor(
            asf_username="test",
            asf_password="test"
        )
        
        progress_events = []
        log_events = []
        
        def on_progress(step, progress, message):
            progress_events.append({
                "step": step,
                "progress": progress,
                "message": message
            })
        
        def on_log(message):
            log_events.append(message)
        
        processor.on_progress(on_progress)
        processor.on_log(on_log)
        
        # Simulate starting a step
        result = processor._start_step(ProcessingStep.DOWNLOAD_DATA)
        
        # Verify progress was reported
        self.assertGreater(len(progress_events), 0)
        self.assertEqual(progress_events[0]["step"], ProcessingStep.DOWNLOAD_DATA)
        self.assertEqual(progress_events[0]["progress"], 0)
        
        # Verify log was recorded
        self.assertGreater(len(log_events), 0)


class TestMockedProcessing(unittest.TestCase):
    """Test processing steps with mocked PyGMTSAR"""
    
    @patch('insar_processor.InSARProcessor.download_data')
    def test_download_data_mock(self, mock_download):
        """Test download_data with mock"""
        mock_result = ProcessingResult(
            step=ProcessingStep.DOWNLOAD_DATA,
            status=ProcessingStatus.COMPLETED,
            start_time=datetime.now(),
            end_time=datetime.now(),
            output_files=["scene1.SAFE", "scene2.SAFE"]
        )
        mock_download.return_value = mock_result
        
        processor = create_turkey_earthquake_processor(
            asf_username="test",
            asf_password="test"
        )
        
        result = processor.download_data()
        
        self.assertEqual(result.status, ProcessingStatus.COMPLETED)
        self.assertEqual(len(result.output_files), 2)
    
    def test_step_sequence(self):
        """Test that steps can be executed in sequence"""
        processor = create_turkey_earthquake_processor(
            asf_username="test",
            asf_password="test"
        )
        
        # Verify all steps are defined
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
        
        for step in steps:
            self.assertIsInstance(step, ProcessingStep)


class TestConfigurationValidation(unittest.TestCase):
    """Test configuration validation"""
    
    def test_empty_bursts_list(self):
        """Test configuration with empty bursts list"""
        config = ProcessingConfig(
            asf_username="test",
            asf_password="test",
            bursts=[]
        )
        
        self.assertEqual(len(config.bursts), 0)
    
    def test_invalid_resolution(self):
        """Test configuration with various resolutions"""
        # Low resolution (coarse)
        config_low = ProcessingConfig(resolution=500.0)
        self.assertEqual(config_low.resolution, 500.0)
        
        # High resolution (fine)
        config_high = ProcessingConfig(resolution=60.0)
        self.assertEqual(config_high.resolution, 60.0)
    
    def test_snaphu_parameters(self):
        """Test SNAPHU unwrapping parameters"""
        config = ProcessingConfig(
            snaphu_tiles=(8, 8),
            snaphu_overlap=(400, 400)
        )
        
        self.assertEqual(config.snaphu_tiles, (8, 8))
        self.assertEqual(config.snaphu_overlap, (400, 400))
    
    def test_goldstein_parameters(self):
        """Test Goldstein filter parameters"""
        config = ProcessingConfig(
            goldstein_psize=64,
            goldstein_alpha=0.8
        )
        
        self.assertEqual(config.goldstein_psize, 64)
        self.assertEqual(config.goldstein_alpha, 0.8)


def run_tests():
    """Run all tests and return results"""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestProcessingConfig))
    suite.addTests(loader.loadTestsFromTestCase(TestProcessingStep))
    suite.addTests(loader.loadTestsFromTestCase(TestProcessingStatus))
    suite.addTests(loader.loadTestsFromTestCase(TestProcessingResult))
    suite.addTests(loader.loadTestsFromTestCase(TestInSARProcessor))
    suite.addTests(loader.loadTestsFromTestCase(TestTurkeyEarthquakeFactory))
    suite.addTests(loader.loadTestsFromTestCase(TestTurkeyEarthquakeParameters))
    suite.addTests(loader.loadTestsFromTestCase(TestMockedProcessing))
    suite.addTests(loader.loadTestsFromTestCase(TestConfigurationValidation))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result


if __name__ == "__main__":
    run_tests()
