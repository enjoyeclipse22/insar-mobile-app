#!/usr/bin/env python3
"""
InSAR 数据可视化脚本
用于生成 DEM、干涉图、解缠相位和形变图的可视化图像
"""

import sys
import json
import numpy as np
import rasterio
from rasterio.transform import from_bounds
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path


def visualize_dem(input_tif: str, output_png: str, bounds: dict, title: str = "Digital Elevation Model"):
    """生成 DEM 可视化图像"""
    with rasterio.open(input_tif) as src:
        dem = src.read(1)
        
    fig, ax = plt.subplots(figsize=(10, 10))
    im = ax.imshow(dem, cmap='terrain', 
                   extent=[bounds['west'], bounds['east'], bounds['south'], bounds['north']],
                   vmin=0, vmax=np.percentile(dem, 99))
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_title(title)
    plt.colorbar(im, ax=ax, label='Elevation (m)')
    
    # 添加等高线
    height, width = dem.shape
    lons = np.linspace(bounds['west'], bounds['east'], width)
    lats = np.linspace(bounds['north'], bounds['south'], height)
    LON, LAT = np.meshgrid(lons, lats)
    levels = np.linspace(np.percentile(dem, 10), np.percentile(dem, 90), 5)
    cs = ax.contour(LON, LAT, dem, levels=levels, colors='black', linewidths=0.5, alpha=0.5)
    ax.clabel(cs, inline=True, fontsize=8, fmt='%d m')
    
    plt.savefig(output_png, dpi=150, bbox_inches='tight')
    plt.close()
    
    return {
        'min': float(np.min(dem)),
        'max': float(np.max(dem)),
        'mean': float(np.mean(dem))
    }


def visualize_interferogram(phase_file: str, coherence_file: str, output_png: str, 
                           bounds: dict, width: int, height: int):
    """生成干涉图可视化图像"""
    # 读取相位数据
    with open(phase_file, 'rb') as f:
        data = f.read()
    complex_data = np.frombuffer(data, dtype=np.float32)
    real = complex_data[::2]
    imag = complex_data[1::2]
    wrapped_phase = np.arctan2(imag, real).reshape(height, width)
    
    # 读取相干性数据
    with open(coherence_file, 'rb') as f:
        coherence_data = np.frombuffer(f.read(), dtype=np.float32).reshape(height, width)
    
    # 创建可视化
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    
    # 左图：包裹相位
    ax1 = axes[0]
    im1 = ax1.imshow(wrapped_phase, cmap='hsv', 
                     extent=[bounds['west'], bounds['east'], bounds['south'], bounds['north']],
                     vmin=-np.pi, vmax=np.pi)
    ax1.set_xlabel('Longitude')
    ax1.set_ylabel('Latitude')
    ax1.set_title('Wrapped Interferogram (Fringes)')
    plt.colorbar(im1, ax=ax1, label='Phase (rad)')
    
    # 右图：相干性
    ax2 = axes[1]
    im2 = ax2.imshow(coherence_data, cmap='gray', 
                     extent=[bounds['west'], bounds['east'], bounds['south'], bounds['north']],
                     vmin=0, vmax=1)
    ax2.set_xlabel('Longitude')
    ax2.set_ylabel('Latitude')
    ax2.set_title('Coherence Map')
    plt.colorbar(im2, ax=ax2, label='Coherence')
    
    plt.tight_layout()
    plt.savefig(output_png, dpi=150, bbox_inches='tight')
    plt.close()
    
    return {
        'mean_coherence': float(np.mean(coherence_data))
    }


def visualize_unwrapped_phase(input_tif: str, output_png: str, bounds: dict, 
                              title: str = "Unwrapped Phase"):
    """生成解缠相位可视化图像"""
    with rasterio.open(input_tif) as src:
        data = src.read(1)
        
    fig, ax = plt.subplots(figsize=(10, 10))
    im = ax.imshow(data, cmap='jet', 
                   extent=[bounds['west'], bounds['east'], bounds['south'], bounds['north']])
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_title(title)
    plt.colorbar(im, ax=ax, label='Phase (rad)')
    
    plt.savefig(output_png, dpi=150, bbox_inches='tight')
    plt.close()
    
    return {
        'min': float(np.min(data)),
        'max': float(np.max(data)),
        'mean': float(np.mean(data))
    }


def visualize_deformation(input_tif: str, output_png: str, bounds: dict,
                          title: str = "Ground Deformation"):
    """生成形变图可视化图像"""
    with rasterio.open(input_tif) as src:
        data = src.read(1)
        
    fig, ax = plt.subplots(figsize=(10, 10))
    
    # 使用对称的颜色范围
    vmax = max(abs(np.min(data)), abs(np.max(data)))
    vmin = -vmax
    
    im = ax.imshow(data, cmap='RdBu_r', 
                   extent=[bounds['west'], bounds['east'], bounds['south'], bounds['north']],
                   vmin=vmin, vmax=vmax)
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_title(title)
    plt.colorbar(im, ax=ax, label='Vertical Displacement (mm)')
    
    # 添加统计信息
    stats_text = f'Max: {np.max(data):.1f} mm\nMin: {np.min(data):.1f} mm\nMean: {np.mean(data):.1f} mm'
    ax.text(0.02, 0.98, stats_text, transform=ax.transAxes, fontsize=10,
            verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
    
    plt.savefig(output_png, dpi=150, bbox_inches='tight')
    plt.close()
    
    return {
        'max': float(np.max(data)),
        'min': float(np.min(data)),
        'mean': float(np.mean(data)),
        'std': float(np.std(data))
    }


def create_geotiff(data: np.ndarray, output_path: str, bounds: dict):
    """创建 GeoTIFF 文件"""
    height, width = data.shape
    transform = from_bounds(bounds['west'], bounds['south'], bounds['east'], bounds['north'], width, height)
    
    with rasterio.open(
        output_path,
        'w',
        driver='GTiff',
        height=height,
        width=width,
        count=1,
        dtype=data.dtype,
        crs='EPSG:4326',
        transform=transform,
    ) as dst:
        dst.write(data, 1)


def unwrap_phase(phase_file: str, width: int, height: int) -> np.ndarray:
    """简单的相位解缠算法"""
    with open(phase_file, 'rb') as f:
        data = f.read()
    
    complex_data = np.frombuffer(data, dtype=np.float32)
    real = complex_data[::2]
    imag = complex_data[1::2]
    phase = np.arctan2(imag, real).reshape(height, width)
    
    # 路径积分解缠
    unwrapped = np.zeros_like(phase)
    unwrapped[0, 0] = phase[0, 0]
    
    # 第一行
    for x in range(1, width):
        diff = phase[0, x] - phase[0, x-1]
        wrapped_diff = np.arctan2(np.sin(diff), np.cos(diff))
        unwrapped[0, x] = unwrapped[0, x-1] + wrapped_diff
    
    # 其余行
    for y in range(1, height):
        for x in range(width):
            diff = phase[y, x] - phase[y-1, x]
            wrapped_diff = np.arctan2(np.sin(diff), np.cos(diff))
            unwrapped[y, x] = unwrapped[y-1, x] + wrapped_diff
    
    return unwrapped


def calculate_deformation(unwrapped_phase: np.ndarray, 
                         wavelength: float = 0.0554,
                         incidence_angle: float = 39.0) -> np.ndarray:
    """从解缠相位计算形变量"""
    incidence_rad = np.radians(incidence_angle)
    conversion_factor = (wavelength / (4 * np.pi)) * 1000  # 转换为毫米
    
    los_displacement = unwrapped_phase * conversion_factor
    vertical_displacement = los_displacement / np.cos(incidence_rad)
    
    return vertical_displacement


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("Usage: python visualize_insar.py <command> <args...>")
        print("Commands:")
        print("  dem <input_tif> <output_png> <bounds_json>")
        print("  interferogram <phase_file> <coherence_file> <output_png> <bounds_json> <width> <height>")
        print("  unwrapped <input_tif> <output_png> <bounds_json>")
        print("  deformation <input_tif> <output_png> <bounds_json>")
        print("  process <phase_file> <output_dir> <bounds_json> <width> <height>")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "dem":
        input_tif, output_png, bounds_json = sys.argv[2:5]
        bounds = json.loads(bounds_json)
        stats = visualize_dem(input_tif, output_png, bounds)
        print(json.dumps(stats))
        
    elif command == "interferogram":
        phase_file, coherence_file, output_png, bounds_json, width, height = sys.argv[2:8]
        bounds = json.loads(bounds_json)
        stats = visualize_interferogram(phase_file, coherence_file, output_png, bounds, int(width), int(height))
        print(json.dumps(stats))
        
    elif command == "unwrapped":
        input_tif, output_png, bounds_json = sys.argv[2:5]
        bounds = json.loads(bounds_json)
        stats = visualize_unwrapped_phase(input_tif, output_png, bounds)
        print(json.dumps(stats))
        
    elif command == "deformation":
        input_tif, output_png, bounds_json = sys.argv[2:5]
        bounds = json.loads(bounds_json)
        stats = visualize_deformation(input_tif, output_png, bounds)
        print(json.dumps(stats))
        
    elif command == "process":
        phase_file, output_dir, bounds_json, width, height = sys.argv[2:7]
        bounds = json.loads(bounds_json)
        width, height = int(width), int(height)
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. 解缠相位
        print("Unwrapping phase...", file=sys.stderr)
        unwrapped = unwrap_phase(phase_file, width, height)
        unwrapped_tif = output_dir / "unwrapped_phase.tif"
        create_geotiff(unwrapped.astype(np.float32), str(unwrapped_tif), bounds)
        
        # 2. 生成解缠相位可视化
        unwrapped_png = output_dir / "unwrapped_phase.png"
        unwrap_stats = visualize_unwrapped_phase(str(unwrapped_tif), str(unwrapped_png), bounds)
        
        # 3. 计算形变
        print("Calculating deformation...", file=sys.stderr)
        deformation = calculate_deformation(unwrapped)
        deformation_tif = output_dir / "deformation.tif"
        create_geotiff(deformation.astype(np.float32), str(deformation_tif), bounds)
        
        # 4. 生成形变可视化
        deformation_png = output_dir / "deformation.png"
        deform_stats = visualize_deformation(str(deformation_tif), str(deformation_png), bounds)
        
        result = {
            'unwrapped_tif': str(unwrapped_tif),
            'unwrapped_png': str(unwrapped_png),
            'deformation_tif': str(deformation_tif),
            'deformation_png': str(deformation_png),
            'unwrap_stats': unwrap_stats,
            'deformation_stats': deform_stats
        }
        print(json.dumps(result))
        
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
