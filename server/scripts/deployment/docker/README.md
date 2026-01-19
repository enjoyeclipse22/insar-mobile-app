# PyGMTSAR InSAR Docker 部署指南

本目录包含 Docker 一键部署 PyGMTSAR InSAR 处理环境所需的所有文件。

## 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 多阶段构建镜像，包含 GMTSAR 编译 |
| `docker-compose.yml` | 容器编排配置 |
| `.dockerignore` | Docker 构建忽略文件 |
| `env.template` | 环境变量模板 |

## 快速开始

### 1. 配置环境变量

```bash
# 复制模板文件
cp env.template .env

# 编辑配置（填入 ASF 凭据）
nano .env
```

### 2. 构建镜像

```bash
# 构建镜像（首次约需 10-15 分钟）
docker-compose build

# 或使用 docker 命令
docker build -t pygmtsar-insar .
```

### 3. 启动容器

```bash
# 启动交互式容器
docker-compose up -d

# 进入容器
docker-compose exec insar bash
```

### 4. 运行测试

```bash
# 在容器内运行测试
python3 /workspace/scripts/test_turkey_integration.py
```

## 使用方式

### 交互式处理

```bash
# 进入容器
docker-compose exec insar bash

# 运行 Python 脚本
python3 /workspace/scripts/insar_processor.py
```

### API 服务模式

```bash
# 启动 API 服务
docker-compose --profile api up -d insar-api

# 访问 API
curl http://localhost:8001/health
```

### 挂载数据目录

```bash
# 将本地数据目录挂载到容器
docker run -it --rm \
  -v $(pwd)/my_data:/workspace/data \
  -v $(pwd)/my_results:/workspace/results \
  pygmtsar-insar bash
```

## 目录结构

容器内的工作目录结构：

```
/workspace/
├── data/           # 输入数据目录（挂载）
├── results/        # 输出结果目录（挂载）
├── logs/           # 日志目录（挂载）
├── scripts/        # 处理脚本
│   ├── insar_processor.py
│   ├── test_turkey_integration.py
│   └── insar_service.py
└── custom_scripts/ # 自定义脚本（挂载）
```

## 资源配置

默认资源限制（可在 docker-compose.yml 中修改）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| CPU 限制 | 4 核 | 最大 CPU 使用 |
| 内存限制 | 8 GB | 最大内存使用 |
| CPU 预留 | 2 核 | 最小 CPU 保证 |
| 内存预留 | 4 GB | 最小内存保证 |

对于大规模处理，建议增加资源限制：

```yaml
deploy:
  resources:
    limits:
      cpus: '8'
      memory: 16G
```

## 常用命令

```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f insar

# 停止容器
docker-compose down

# 重建镜像
docker-compose build --no-cache

# 清理未使用的镜像
docker system prune -a
```

## 故障排除

### 构建失败

```bash
# 清理缓存重新构建
docker-compose build --no-cache
```

### 内存不足

```bash
# 增加 Docker 内存限制（Docker Desktop）
# Settings -> Resources -> Memory -> 增加到 8GB+
```

### 权限问题

```bash
# 以 root 用户运行
docker-compose exec -u root insar bash
```

## 版本信息

- 基础镜像: Ubuntu 22.04
- GMT: 6.x
- GMTSAR: 最新版
- PyGMTSAR: 最新版
- Python: 3.10+
