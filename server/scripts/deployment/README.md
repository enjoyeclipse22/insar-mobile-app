# PyGMTSAR InSAR 处理环境部署指南

本文档提供在 **Ubuntu 服务器** 和 **Windows 本机** 上部署 PyGMTSAR InSAR 处理环境的完整指南。

## 目录

1. [系统要求](#系统要求)
2. [Ubuntu 服务器安装](#ubuntu-服务器安装)
3. [Windows 安装](#windows-安装)
4. [配置 ASF 凭据](#配置-asf-凭据)
5. [运行 InSAR 处理](#运行-insar-处理)
6. [常见问题](#常见问题)

---

## 系统要求

### 硬件要求

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 4 核 | 8+ 核 |
| 内存 | 8 GB | 16+ GB |
| 磁盘空间 | 50 GB | 100+ GB |
| 网络 | 稳定的互联网连接 | 高速宽带 |

### 软件要求

**Ubuntu:**
- Ubuntu 20.04 / 22.04 / 24.04 LTS
- sudo 权限

**Windows:**
- Windows 10 (版本 2004+) 或 Windows 11
- 管理员权限
- WSL2 支持（推荐）或 Conda

---

## Ubuntu 服务器安装

### 方法一：使用自动安装脚本（推荐）

```bash
# 1. 下载安装脚本
wget https://raw.githubusercontent.com/your-repo/insar-scripts/main/setup_ubuntu.sh

# 2. 添加执行权限
chmod +x setup_ubuntu.sh

# 3. 运行安装脚本
./setup_ubuntu.sh
```

### 方法二：手动安装

#### 步骤 1：安装系统依赖

```bash
# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 安装编译工具
sudo apt-get install -y build-essential cmake autoconf automake libtool pkg-config git wget curl

# 安装 GMT 和 GMTSAR 依赖
sudo apt-get install -y gmt gmt-dcw gmt-gshhg libgmt-dev libgmt6
sudo apt-get install -y libnetcdf-dev libfftw3-dev liblapack-dev libblas-dev libhdf5-dev
sudo apt-get install -y tcsh csh gfortran gcc-9 g++-9

# 安装 Python
sudo apt-get install -y python3 python3-pip python3-dev python3-venv

# 安装 GDAL
sudo apt-get install -y gdal-bin libgdal-dev
```

#### 步骤 2：编译安装 GMTSAR

```bash
# 克隆 GMTSAR 源码
cd /usr/local
sudo git clone --depth=1 --branch master https://github.com/gmtsar/gmtsar.git GMTSAR

# 编译安装
cd GMTSAR
sudo autoconf
sudo ./configure --with-orbits-dir=/usr/local/orbits
sudo make -j$(nproc)
sudo make install

# 添加到 PATH
echo 'export PATH=$PATH:/usr/local/GMTSAR/bin' >> ~/.bashrc
echo 'export GMTSAR_HOME=/usr/local/GMTSAR' >> ~/.bashrc
source ~/.bashrc
```

#### 步骤 3：安装 Python 包

```bash
# 升级 pip
sudo pip3 install --upgrade pip

# 安装 PyGMTSAR 和依赖
sudo pip3 install pygmtsar numpy scipy pandas xarray dask matplotlib cartopy asf_search
```

#### 步骤 4：验证安装

```bash
# 验证 GMT
gmt --version

# 验证 GMTSAR
make_s1a_tops

# 验证 PyGMTSAR
python3 -c "import pygmtsar; print(pygmtsar.__version__)"
```

---

## Windows 安装

Windows 提供两种安装方式：

| 方式 | 优点 | 缺点 |
|------|------|------|
| WSL2（推荐） | 完整 Linux 环境，完全兼容 | 需要启用虚拟化 |
| Conda | 安装简单，原生 Windows | GMTSAR 二进制不可用 |

### 方法一：使用 WSL2（推荐）

#### 步骤 1：启用 WSL2

以管理员身份运行 PowerShell：

```powershell
# 启用 WSL
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# 启用虚拟机平台
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# 重启计算机
Restart-Computer
```

#### 步骤 2：安装 Ubuntu

```powershell
# 设置 WSL2 为默认版本
wsl --set-default-version 2

# 安装 Ubuntu
wsl --install -d Ubuntu
```

#### 步骤 3：在 WSL 中安装 InSAR 环境

打开 Ubuntu 终端，运行：

```bash
# 下载并运行安装脚本
wget https://raw.githubusercontent.com/your-repo/insar-scripts/main/setup_ubuntu.sh
chmod +x setup_ubuntu.sh
./setup_ubuntu.sh
```

#### 使用自动安装脚本

或者直接运行 Windows 批处理脚本：

```cmd
# 以管理员身份运行
setup_windows.bat
```

### 方法二：使用 Conda

如果无法使用 WSL2，可以使用 Conda 方式：

```cmd
# 运行 Conda 安装脚本
setup_windows_conda.bat
```

**注意：** Conda 方式不包含 GMTSAR 二进制文件，部分高级功能可能不可用。

---

## 配置 ASF 凭据

### 注册 ASF 账户

1. 访问 [NASA Earthdata](https://urs.earthdata.nasa.gov/users/new)
2. 创建免费账户
3. 记录用户名和密码

### 配置凭据

#### Ubuntu

编辑配置文件：

```bash
nano ~/insar_workspace/scripts/config.env
```

内容：

```bash
ASF_USERNAME=your_username
ASF_PASSWORD=your_password
```

#### Windows

编辑配置文件：

```
%USERPROFILE%\insar_workspace\scripts\config.env
```

---

## 运行 InSAR 处理

### 基本用法

#### Ubuntu

```bash
cd ~/insar_workspace

# 运行测试（下载数据 + 基础处理）
./run_insar.sh turkey test

# 仅下载数据
./run_insar.sh turkey download

# 完整处理（需要更多内存）
./run_insar.sh turkey full
```

#### Windows (WSL)

```cmd
# 打开 WSL
wsl

# 运行处理
cd ~/insar_workspace
./run_insar.sh turkey test
```

#### Windows (Conda)

```cmd
# 双击运行
run_insar.bat test
```

### 使用 Python API

```python
from insar_processor import InSARProcessor, ProcessingConfig

# 创建配置
config = ProcessingConfig(
    asf_username="your_username",
    asf_password="your_password",
    bursts=[
        "S1_043817_IW2_20230210T033503_VV_E5B0-BURST",
        "S1_043817_IW2_20230129T033504_VV_BE0B-BURST",
    ],
    epicenters=[(37.24, 38.11)],  # 土耳其地震震中
    resolution=180,
    data_dir="./data",
    work_dir="./work",
    output_dir="./results"
)

# 创建处理器
processor = InSARProcessor(config)

# 设置进度回调
def on_progress(step, progress, message):
    print(f"[{step}] {progress}% - {message}")

processor.set_progress_callback(on_progress)

# 运行处理
processor.download_data()
processor.download_dem()
processor.download_landmask()
processor.generate_visualizations()
```

### 预设配置

#### 土耳其地震 (2023)

```python
from insar_processor import create_turkey_earthquake_config

config = create_turkey_earthquake_config(
    asf_username="your_username",
    asf_password="your_password"
)
```

---

## 常见问题

### Q1: GMTSAR 编译失败

**问题：** `make` 命令报错

**解决方案：**
```bash
# 确保安装了所有依赖
sudo apt-get install -y gfortran gcc-9 g++-9 libnetcdf-dev libfftw3-dev

# 清理并重新编译
cd /usr/local/GMTSAR
sudo make clean
sudo make -j$(nproc)
```

### Q2: PyGMTSAR 找不到 GMTSAR

**问题：** `make_s1a_tops not found`

**解决方案：**
```bash
# 确保 PATH 正确设置
export PATH=$PATH:/usr/local/GMTSAR/bin
source ~/.bashrc

# 验证
which make_s1a_tops
```

### Q3: 内存不足

**问题：** 处理过程中 Dask worker 崩溃

**解决方案：**
1. 增加系统内存（推荐 16GB+）
2. 降低处理分辨率：
   ```python
   config.resolution = 360  # 从 180 改为 360
   ```
3. 减少并行度：
   ```python
   # 在脚本中设置
   import dask
   dask.config.set(scheduler='synchronous')
   ```

### Q4: ASF 认证失败

**问题：** `Authentication failed`

**解决方案：**
1. 确认用户名和密码正确
2. 检查是否已接受 NASA EULA
3. 访问 https://urs.earthdata.nasa.gov 登录验证

### Q5: Windows WSL2 启动失败

**问题：** `WSL 2 requires an update to its kernel component`

**解决方案：**
1. 下载 WSL2 内核更新包：
   https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi
2. 安装更新包
3. 重启计算机

---

## 文件结构

```
deployment/
├── setup_ubuntu.sh          # Ubuntu 自动安装脚本
├── setup_windows.bat        # Windows WSL2 安装脚本
├── setup_windows_conda.bat  # Windows Conda 安装脚本
└── README.md                # 本文档

scripts/
├── insar_processor.py       # InSAR 处理核心类
├── insar_service.py         # FastAPI 服务包装器
├── test_insar_processor.py  # 单元测试
└── test_turkey_integration.py # 集成测试
```

---

## 技术支持

如有问题，请：
1. 查看本文档的常见问题部分
2. 检查日志文件：`~/insar_workspace/logs/`
3. 提交 Issue 到项目仓库

---

**版本：** 1.0.0  
**更新日期：** 2026-01-20
