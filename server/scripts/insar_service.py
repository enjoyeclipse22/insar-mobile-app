"""
InSAR Processing Service - FastAPI Wrapper

Provides REST API endpoints for the InSARProcessor class.
Supports async processing with WebSocket progress updates.

Author: InSAR Pro Mobile Team
Date: 2025-01-20
"""

import os
import sys
import json
import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from threading import Thread
from queue import Queue

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="InSAR Processing Service",
    description="REST API for InSAR processing using PyGMTSAR",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state for managing processing tasks
processing_tasks: Dict[str, Dict[str, Any]] = {}
websocket_connections: Dict[str, List[WebSocket]] = {}


# Pydantic models for request/response
class ProcessingRequest(BaseModel):
    """Request model for starting InSAR processing"""
    task_id: str = Field(..., description="Unique task identifier")
    asf_username: str = Field(..., description="ASF username")
    asf_password: str = Field(..., description="ASF password")
    bursts: List[str] = Field(..., description="List of burst IDs to process")
    epicenters: List[List[float]] = Field(default=[], description="List of [lat, lon] epicenter coordinates")
    polarization: str = Field(default="VV", description="Polarization (VV or VH)")
    orbit_direction: str = Field(default="D", description="Orbit direction (A or D)")
    resolution: float = Field(default=180.0, description="Processing resolution in meters")
    output_dir: Optional[str] = Field(default=None, description="Output directory")


class TurkeyProcessingRequest(BaseModel):
    """Request model for Turkey earthquake processing"""
    task_id: str = Field(..., description="Unique task identifier")
    asf_username: str = Field(..., description="ASF username")
    asf_password: str = Field(..., description="ASF password")
    resolution: float = Field(default=180.0, description="Processing resolution in meters")
    output_dir: Optional[str] = Field(default=None, description="Output directory")


class ProcessingResponse(BaseModel):
    """Response model for processing status"""
    task_id: str
    status: str
    message: str
    progress: Optional[float] = None
    current_step: Optional[str] = None
    results: Optional[Dict[str, Any]] = None


class TaskStatusResponse(BaseModel):
    """Response model for task status query"""
    task_id: str
    status: str
    total_steps: int
    completed_steps: int
    failed_steps: int
    current_step: Optional[str] = None
    progress: float
    results: Dict[str, Any]
    output_files: List[str]


# Helper functions
def get_task_output_dir(task_id: str) -> str:
    """Get output directory for a task"""
    base_dir = os.environ.get("INSAR_OUTPUT_DIR", "/home/ubuntu/insar_results")
    return os.path.join(base_dir, task_id)


async def broadcast_progress(task_id: str, step: ProcessingStep, progress: float, message: str):
    """Broadcast progress to all connected WebSocket clients"""
    if task_id in websocket_connections:
        data = json.dumps({
            "type": "progress",
            "task_id": task_id,
            "step": step.value,
            "progress": progress,
            "message": message,
            "timestamp": datetime.now().isoformat()
        })
        
        disconnected = []
        for ws in websocket_connections[task_id]:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.append(ws)
        
        # Remove disconnected clients
        for ws in disconnected:
            websocket_connections[task_id].remove(ws)


def run_processing_task(task_id: str, processor: InSARProcessor, loop: asyncio.AbstractEventLoop):
    """Run processing task in background thread"""
    try:
        processing_tasks[task_id]["status"] = "running"
        
        # Set up progress callback
        def on_progress(step: ProcessingStep, progress: float, message: str):
            processing_tasks[task_id]["current_step"] = step.value
            processing_tasks[task_id]["progress"] = progress
            processing_tasks[task_id]["message"] = message
            
            # Schedule WebSocket broadcast
            asyncio.run_coroutine_threadsafe(
                broadcast_progress(task_id, step, progress, message),
                loop
            )
        
        def on_log(message: str):
            if "logs" not in processing_tasks[task_id]:
                processing_tasks[task_id]["logs"] = []
            processing_tasks[task_id]["logs"].append({
                "timestamp": datetime.now().isoformat(),
                "message": message
            })
        
        processor.on_progress(on_progress)
        processor.on_log(on_log)
        
        # Run processing
        results = processor.run()
        
        # Update task status
        processing_tasks[task_id]["status"] = "completed"
        processing_tasks[task_id]["results"] = processor.get_status()
        processing_tasks[task_id]["output_files"] = []
        
        # Collect output files
        for step_result in results.values():
            if step_result.output_files:
                processing_tasks[task_id]["output_files"].extend(step_result.output_files)
        
    except Exception as e:
        logger.error(f"Processing task {task_id} failed: {e}")
        processing_tasks[task_id]["status"] = "failed"
        processing_tasks[task_id]["error"] = str(e)


# API Endpoints
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "InSAR Processing Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_tasks": len([t for t in processing_tasks.values() if t.get("status") == "running"])
    }


@app.post("/process", response_model=ProcessingResponse)
async def start_processing(request: ProcessingRequest, background_tasks: BackgroundTasks):
    """Start a new InSAR processing task"""
    
    # Check if task already exists
    if request.task_id in processing_tasks:
        raise HTTPException(status_code=400, detail=f"Task {request.task_id} already exists")
    
    # Create output directory
    output_dir = request.output_dir or get_task_output_dir(request.task_id)
    os.makedirs(output_dir, exist_ok=True)
    
    # Create configuration
    config = ProcessingConfig(
        asf_username=request.asf_username,
        asf_password=request.asf_password,
        bursts=request.bursts,
        epicenters=[tuple(e) for e in request.epicenters],
        polarization=request.polarization,
        orbit_direction=request.orbit_direction,
        resolution=request.resolution,
        output_dir=output_dir
    )
    
    # Create processor
    processor = InSARProcessor(config)
    
    # Initialize task state
    processing_tasks[request.task_id] = {
        "status": "pending",
        "processor": processor,
        "config": {
            "bursts": request.bursts,
            "resolution": request.resolution,
            "output_dir": output_dir
        },
        "created_at": datetime.now().isoformat(),
        "current_step": None,
        "progress": 0,
        "message": "Task created",
        "results": None,
        "output_files": [],
        "logs": []
    }
    
    # Start processing in background
    loop = asyncio.get_event_loop()
    thread = Thread(target=run_processing_task, args=(request.task_id, processor, loop))
    thread.start()
    
    return ProcessingResponse(
        task_id=request.task_id,
        status="started",
        message="Processing task started",
        progress=0
    )


@app.post("/process/turkey", response_model=ProcessingResponse)
async def start_turkey_processing(request: TurkeyProcessingRequest, background_tasks: BackgroundTasks):
    """Start Turkey earthquake InSAR processing task"""
    
    # Check if task already exists
    if request.task_id in processing_tasks:
        raise HTTPException(status_code=400, detail=f"Task {request.task_id} already exists")
    
    # Create output directory
    output_dir = request.output_dir or get_task_output_dir(request.task_id)
    os.makedirs(output_dir, exist_ok=True)
    
    # Create processor using factory function
    processor = create_turkey_earthquake_processor(
        asf_username=request.asf_username,
        asf_password=request.asf_password,
        output_dir=output_dir,
        resolution=request.resolution
    )
    
    # Initialize task state
    processing_tasks[request.task_id] = {
        "status": "pending",
        "processor": processor,
        "config": {
            "type": "turkey_earthquake",
            "resolution": request.resolution,
            "output_dir": output_dir
        },
        "created_at": datetime.now().isoformat(),
        "current_step": None,
        "progress": 0,
        "message": "Task created",
        "results": None,
        "output_files": [],
        "logs": []
    }
    
    # Start processing in background
    loop = asyncio.get_event_loop()
    thread = Thread(target=run_processing_task, args=(request.task_id, processor, loop))
    thread.start()
    
    return ProcessingResponse(
        task_id=request.task_id,
        status="started",
        message="Turkey earthquake processing task started",
        progress=0
    )


@app.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get status of a processing task"""
    
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    task = processing_tasks[task_id]
    
    # Calculate progress
    total_steps = 10
    completed_steps = 0
    failed_steps = 0
    
    if task.get("results"):
        results = task["results"].get("results", {})
        for step_result in results.values():
            if step_result.get("status") == "completed":
                completed_steps += 1
            elif step_result.get("status") == "failed":
                failed_steps += 1
    
    progress = (completed_steps / total_steps) * 100 if total_steps > 0 else 0
    
    return TaskStatusResponse(
        task_id=task_id,
        status=task.get("status", "unknown"),
        total_steps=total_steps,
        completed_steps=completed_steps,
        failed_steps=failed_steps,
        current_step=task.get("current_step"),
        progress=progress,
        results=task.get("results", {}),
        output_files=task.get("output_files", [])
    )


@app.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str, limit: int = 100):
    """Get logs for a processing task"""
    
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    logs = processing_tasks[task_id].get("logs", [])
    
    return {
        "task_id": task_id,
        "total_logs": len(logs),
        "logs": logs[-limit:]
    }


@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a processing task"""
    
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    task = processing_tasks[task_id]
    
    if task.get("status") not in ["pending", "running"]:
        raise HTTPException(status_code=400, detail=f"Task {task_id} is not running")
    
    # Cancel the processor
    processor = task.get("processor")
    if processor:
        processor.cancel()
    
    task["status"] = "cancelled"
    task["message"] = "Task cancelled by user"
    
    return {
        "task_id": task_id,
        "status": "cancelled",
        "message": "Task cancelled successfully"
    }


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a processing task"""
    
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    task = processing_tasks[task_id]
    
    if task.get("status") == "running":
        raise HTTPException(status_code=400, detail=f"Cannot delete running task {task_id}")
    
    del processing_tasks[task_id]
    
    return {
        "task_id": task_id,
        "message": "Task deleted successfully"
    }


@app.get("/tasks")
async def list_tasks():
    """List all processing tasks"""
    
    tasks = []
    for task_id, task in processing_tasks.items():
        tasks.append({
            "task_id": task_id,
            "status": task.get("status"),
            "created_at": task.get("created_at"),
            "current_step": task.get("current_step"),
            "progress": task.get("progress", 0)
        })
    
    return {
        "total": len(tasks),
        "tasks": tasks
    }


@app.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    """WebSocket endpoint for real-time progress updates"""
    
    await websocket.accept()
    
    # Add to connections
    if task_id not in websocket_connections:
        websocket_connections[task_id] = []
    websocket_connections[task_id].append(websocket)
    
    try:
        # Send current status
        if task_id in processing_tasks:
            task = processing_tasks[task_id]
            await websocket.send_json({
                "type": "status",
                "task_id": task_id,
                "status": task.get("status"),
                "current_step": task.get("current_step"),
                "progress": task.get("progress", 0),
                "message": task.get("message", "")
            })
        
        # Keep connection alive
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                
                # Handle ping/pong
                if data == "ping":
                    await websocket.send_text("pong")
                
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})
            
    except WebSocketDisconnect:
        pass
    finally:
        # Remove from connections
        if task_id in websocket_connections:
            if websocket in websocket_connections[task_id]:
                websocket_connections[task_id].remove(websocket)


# Predefined configurations endpoint
@app.get("/presets")
async def get_presets():
    """Get predefined processing configurations"""
    
    return {
        "presets": [
            {
                "id": "turkey_earthquake_2023",
                "name": "Turkey Earthquake 2023",
                "description": "Mw 7.8 & 7.5 earthquakes on 2023-02-06",
                "bursts": [
                    "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
                    "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
                    "S1_043818_IW2_20230210T033506_VV_E5B0-BURST",
                    "S1_043818_IW2_20230129T033507_VV_BE0B-BURST"
                ],
                "epicenters": [
                    [37.24, 38.11],
                    [37.08, 37.17]
                ],
                "polarization": "VV",
                "orbit_direction": "D",
                "recommended_resolution": 180.0
            }
        ]
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("INSAR_SERVICE_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
