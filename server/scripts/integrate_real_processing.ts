/**
 * 集成真实 SAR 数据处理到 InSAR 处理器
 * 
 * 这个脚本会修改 real-insar-processor.ts 以使用真实的 SAR 数据处理
 */

import * as fs from 'fs';
import * as path from 'path';

const processorPath = path.join(__dirname, '..', 'real-insar-processor.ts');

// 读取现有文件
let content = fs.readFileSync(processorPath, 'utf-8');

// 1. 移除 generateSimulatedPhaseData 的导入
content = content.replace(
  /import \{[^}]*generateSimulatedPhaseData[^}]*\} from "\.\/insar-tools";/,
  `import {
  runSnaphuUnwrap,
  calculateDeformation,
  createGeoTiff,
  createVisualization,
  savePhaseForSnaphu,
  readUnwrappedPhase,
} from "./insar-tools";`
);

// 2. 添加调用真实 SAR 处理脚本的方法
const realProcessingMethod = `
  /**
   * 使用真实 SAR 数据生成干涉图
   * 调用 Python 脚本处理真实的 Sentinel-1 SLC 数据
   */
  private async processRealSARData(slcFiles: string[], outputDir: string): Promise<{
    interferogramImage: string;
    displacementImage: string;
    demOverlayImage: string;
    statistics: {
      coherenceMean: number;
      displacementMin: number;
      displacementMax: number;
      displacementMean: number;
    };
  }> {
    this.log("INFO", "真实SAR处理", "开始处理真实 Sentinel-1 SLC 数据...", 0);
    
    // 查找 VV 极化的 TIFF 文件
    const tiffFiles: string[] = [];
    for (const slcFile of slcFiles.slice(0, 2)) {
      const extractDir = path.join(outputDir, 'extracted', path.basename(slcFile, '.zip'));
      
      // 解压 SLC ZIP 文件
      if (!fs.existsSync(extractDir)) {
        this.log("INFO", "真实SAR处理", \`解压 \${path.basename(slcFile)}...\`, 10);
        await execAsync(\`unzip -q "\${slcFile}" -d "\${extractDir}"\`);
      }
      
      // 查找 VV 极化 TIFF 文件
      const { stdout } = await execAsync(\`find "\${extractDir}" -name "*-vv-*.tiff" | head -1\`);
      const tiffFile = stdout.trim();
      if (tiffFile) {
        tiffFiles.push(tiffFile);
        this.log("DEBUG", "真实SAR处理", \`找到 TIFF: \${path.basename(tiffFile)}\`);
      }
    }
    
    if (tiffFiles.length < 2) {
      throw new Error("未找到足够的 SLC TIFF 文件");
    }
    
    // 调用 Python 脚本处理
    this.log("INFO", "真实SAR处理", "调用 Python 脚本处理 SAR 数据...", 30);
    const scriptPath = path.join(__dirname, 'scripts', 'process_real_sar.py');
    const { stdout } = await execAsync(
      \`python3 "\${scriptPath}" "\${tiffFiles[0]}" "\${tiffFiles[1]}" "\${outputDir}"\`
    );
    
    const result = JSON.parse(stdout);
    
    this.log("INFO", "真实SAR处理", \`处理完成，相干性: \${result.statistics.coherence_mean.toFixed(3)}\`, 100);
    
    return {
      interferogramImage: result.visualizations.interferogram,
      displacementImage: result.visualizations.displacement,
      demOverlayImage: result.visualizations.dem_overlay,
      statistics: {
        coherenceMean: result.statistics.coherence_mean,
        displacementMin: result.statistics.displacement_min,
        displacementMax: result.statistics.displacement_max,
        displacementMean: result.statistics.displacement_mean,
      },
    };
  }
`;

// 在类的末尾添加新方法
const classEndIndex = content.lastIndexOf('}');
content = content.slice(0, classEndIndex) + realProcessingMethod + '\n}';

// 保存修改后的文件
fs.writeFileSync(processorPath, content);
console.log('已更新 real-insar-processor.ts');
