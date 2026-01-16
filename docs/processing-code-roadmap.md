# InSAR 处理流程代码调用路线图

本文档详细描述了 InSAR Pro Mobile 应用中，从用户点击"开始处理"按钮到后端执行真实 InSAR 处理的完整代码调用链路。

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (React Native / Expo)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  app/project/[id].tsx                                                        │
│       │                                                                      │
│       ├── handleStartProcessing()  ←── 用户点击"开始处理"按钮               │
│       │       │                                                              │
│       │       └── startRealProcessingMutation.mutateAsync()                  │
│       │               │                                                      │
│       │               └── tRPC 客户端调用                                    │
│       │                                                                      │
│       └── startPolling()  ←── 轮询处理状态                                   │
│               │                                                              │
│               └── fetch(realInsar.getStatus)                                 │
│                   fetch(realInsar.getLogs)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP POST /api/trpc/realInsar.startProcessing
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              后端 (Node.js / Express / tRPC)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  server/_core/index.ts  ←── Express 服务器入口                               │
│       │                                                                      │
│       └── /api/trpc/*  ←── tRPC 路由处理                                     │
│               │                                                              │
│               └── server/routers.ts  ←── 路由定义                            │
│                       │                                                      │
│                       └── realInsarRouter (from real-insar-routes.ts)        │
│                               │                                              │
│                               └── startProcessing mutation                   │
│                                       │                                      │
│                                       └── startRealProcessing()              │
│                                               │                              │
│                                               └── new RealInSARProcessor()   │
│                                                       │                      │
│                                                       └── processor.process()│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ ASF API 调用
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              外部服务                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ASF (Alaska Satellite Facility)                                             │
│       • https://api.daac.asf.alaska.edu/services/search/param  ←── 数据搜索  │
│       • https://datapool.asf.alaska.edu/*  ←── 数据下载                      │
│                                                                              │
│  SRTM DEM 服务                                                               │
│       • https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/  ←── DEM 下载      │
│                                                                              │
│  ESA 轨道数据服务                                                            │
│       • https://scihub.copernicus.eu/gnss/  ←── 精密轨道下载                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、前端代码调用链

### 2.1 入口文件

| 文件路径 | 作用 |
|---------|------|
| `app/project/[id].tsx` | 项目详情页面，包含处理按钮和状态显示 |
| `lib/trpc.ts` | tRPC 客户端配置 |
| `constants/oauth.ts` | API 基础 URL 配置 |

### 2.2 处理按钮点击流程

**文件**: `app/project/[id].tsx`

```typescript
// 第 92-93 行：定义 tRPC mutation
const startRealProcessingMutation = trpc.realInsar.startProcessing.useMutation();
const cancelRealProcessingMutation = trpc.realInsar.cancelProcessing.useMutation();

// 第 346-428 行：处理按钮点击事件
const handleStartProcessing = async () => {
  // 1. 解析边界坐标
  let bounds = project.bounds;
  
  // 2. 显示确认对话框
  Alert.alert("启动真实处理", ..., [
    {
      text: "开始处理",
      onPress: async () => {
        // 3. 调用 tRPC mutation
        const result = await startRealProcessingMutation.mutateAsync({
          projectId: parseInt(projectId),
          projectName: project.name,
          bounds: bounds!,
          startDate: project.startDate,
          endDate: project.endDate,
          satellite: project.satellite || "Sentinel-1",
          orbitDirection: project.orbitDirection || "both",
          polarization: project.polarization || "VV+VH",
        });
        
        // 4. 保存任务 ID 并开始轮询
        const newTaskId = result.taskId;
        setTaskId(newTaskId);
        await AsyncStorage.setItem(`task_${projectId}`, newTaskId);
        startPolling(newTaskId);
      },
    },
  ]);
};
```

### 2.3 状态轮询流程

**文件**: `app/project/[id].tsx`

```typescript
// 第 266-336 行：轮询处理状态
const startPolling = (newTaskId: string) => {
  const pollStatus = async () => {
    // 1. 获取处理状态
    const apiBase = getApiBaseUrl();
    const status = await fetch(
      `${apiBase}/api/trpc/realInsar.getStatus?input=${encodeURIComponent(JSON.stringify({ json: { taskId: newTaskId } }))}`
    );
    
    // 2. 获取处理日志
    const logs = await fetch(
      `${apiBase}/api/trpc/realInsar.getLogs?input=${encodeURIComponent(JSON.stringify({ json: { taskId: newTaskId, offset: 0, limit: 50 } }))}`
    );
  };
  
  // 每 2 秒轮询一次
  pollingRef.current = setInterval(pollStatus, 2000);
};
```

### 2.4 tRPC 客户端配置

**文件**: `lib/trpc.ts`

```typescript
// 第 21-42 行：创建 tRPC 客户端
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,  // API 端点
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
```

---

## 三、后端代码调用链

### 3.1 服务器文件结构

| 文件路径 | 作用 |
|---------|------|
| `server/_core/index.ts` | Express 服务器入口，挂载 tRPC 路由 |
| `server/routers.ts` | tRPC 路由定义，导出 `appRouter` |
| `server/real-insar-routes.ts` | 真实 InSAR 处理路由，定义 `realInsarRouter` |
| `server/real-insar-processor.ts` | InSAR 处理引擎，`RealInSARProcessor` 类 |
| `server/db.ts` | 数据库操作函数 |
| `drizzle/schema.ts` | 数据库表结构定义 |

### 3.2 路由定义

**文件**: `server/routers.ts`

```typescript
// 第 10-12 行：导入并挂载 realInsarRouter
export const appRouter = router({
  system: systemRouter,
  realInsar: realInsarRouter,  // ← 真实 InSAR 处理路由
  // ...
});
```

### 3.3 真实 InSAR 处理路由

**文件**: `server/real-insar-routes.ts`

```typescript
// 第 753-811 行：定义处理路由
export const realInsarRouter = router({
  // 数据可用性检查
  checkDataAvailability: publicProcedure
    .input(z.object({ bounds, startDate, endDate, satellite, orbitDirection }))
    .query(async ({ input }) => {
      return await checkDataAvailability(...);
    }),

  // 启动处理 ← 主要入口
  startProcessing: publicProcedure
    .input(z.object({
      projectId: z.number(),
      projectName: z.string().optional(),
      bounds: z.object({ north, south, east, west }),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      satellite: z.string().optional(),
      orbitDirection: z.string().optional(),
      polarization: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const taskId = await startRealProcessing(
        input.projectId,
        input.projectName,
        input.bounds,
        input.startDate,
        input.endDate,
        input.satellite,
        input.orbitDirection,
        input.polarization
      );
      return { taskId, message: "处理已启动" };
    }),

  // 获取处理状态
  getStatus: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      return task ? { id, projectId, status, progress, currentStep, ... } : null;
    }),

  // 获取处理日志
  getLogs: publicProcedure
    .input(z.object({ taskId, offset, limit }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      return { logs: task.logs.slice(offset, offset + limit), total: task.logs.length };
    }),

  // 取消处理
  cancelProcessing: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(({ input }) => cancelProcessing(input.taskId)),

  // 获取处理结果
  getResult: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => processingTasks.get(input.taskId)?.result),
});
```

### 3.4 启动处理函数

**文件**: `server/real-insar-routes.ts`

```typescript
// 第 172-340 行：startRealProcessing 函数
async function startRealProcessing(
  projectId: number,
  projectName: string,
  bounds: { north, south, east, west },
  startDate: string,
  endDate: string,
  satellite: string,
  orbitDirection: string,
  polarization: string
): Promise<string> {
  // 1. 生成任务 ID
  const taskId = `task_${projectId}_${Date.now()}`;

  // 2. 创建处理配置
  const config: ProcessingConfig = {
    projectId: taskId,
    projectName,
    bounds,
    startDate,
    endDate,
    satellite,
    orbitDirection,
    polarization,
    resolution: 30,
    coherenceThreshold: 0.3,
  };

  // 3. 创建处理器实例
  const processor = new RealInSARProcessor(config);

  // 4. 创建任务对象并存储
  const task: ProcessingTask = {
    id: taskId,
    projectId,
    projectName,
    status: "pending",
    progress: 0,
    currentStep: "初始化",
    logs: [],
    startTime: new Date(),
    processor,
  };
  processingTasks.set(taskId, task);

  // 5. 初始化数据库中的处理步骤
  const stepIdMap = await initializeProcessingSteps(projectId);

  // 6. 更新项目状态为处理中
  await updateProject(projectId, { status: "processing", progress: 0 });

  // 7. 监听日志事件，保存到数据库
  processor.on("log", async (log: ProcessingLog) => {
    task.logs.push(log);
    task.currentStep = log.step;
    // 保存日志到数据库
    await saveLogToDatabase(projectId, stepId, logLevel, message);
  });

  // 8. 监听完成事件
  processor.on("complete", async (result: ProcessingResult) => {
    task.status = "completed";
    task.progress = 100;
    task.result = result;
    // 保存结果到数据库
    await saveResultToDatabase(projectId, resultType, fileUrl, fileName, stats);
    await updateProject(projectId, { status: "completed", progress: 100 });
  });

  // 9. 异步启动处理
  processor.process().catch((error) => {
    task.status = "failed";
    task.error = error.message;
  });

  return taskId;
}
```

### 3.5 InSAR 处理引擎

**文件**: `server/real-insar-processor.ts`

```typescript
// 第 217-308 行：主处理流程
export class RealInSARProcessor extends EventEmitter {
  async process(): Promise<ProcessingResult> {
    this.startTime = new Date();
    this.log("INFO", "初始化", `开始处理项目: ${this.config.projectName}`);

    try {
      // 步骤 1: 创建工作目录
      await this.executeStep("创建工作目录", async () => {
        fs.mkdirSync(this.workDir, { recursive: true });
      });

      // 步骤 2: 搜索 Sentinel-1 数据
      const searchResults = await this.executeStep("数据搜索", () => 
        this.searchSentinel1Data()
      );

      // 步骤 3: 下载 SLC 数据
      const slcFiles = await this.executeStep("数据下载", () => 
        this.downloadSLCData(searchResults)
      );

      // 步骤 4: 下载轨道数据
      const orbitFiles = await this.executeStep("轨道下载", () => 
        this.downloadOrbitData(searchResults)
      );

      // 步骤 5: 下载 DEM 数据
      const demFile = await this.executeStep("DEM下载", () => 
        this.downloadDEM()
      );

      // 步骤 6: 配准
      const coregisteredFile = await this.executeStep("配准", () => 
        this.performCoregistration(slcFiles, demFile)
      );

      // 步骤 7: 干涉图生成
      const { interferogramFile, coherenceFile, meanCoherence } = 
        await this.executeStep("干涉图生成", () => 
          this.generateInterferogram(coregisteredFile, demFile)
        );

      // 步骤 8: 相位解缠
      const unwrappedPhaseFile = await this.executeStep("相位解缠", () =>
        this.unwrapPhase(interferogramFile, coherenceFile)
      );

      // 步骤 9: 形变反演
      const { deformationFile, statistics } = await this.executeStep("形变反演", () =>
        this.invertDeformation(unwrappedPhaseFile)
      );

      return {
        success: true,
        projectId: this.config.projectId,
        outputs: { slcFiles, demFile, orbitFiles, ... },
        statistics: { meanCoherence, maxDeformation, ... },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

---

## 四、API 端点汇总

### 4.1 处理相关 API

| 端点 | 方法 | 作用 | 调用 URL |
|------|------|------|----------|
| `realInsar.startProcessing` | POST | 启动处理 | `/api/trpc/realInsar.startProcessing` |
| `realInsar.getStatus` | GET | 获取状态 | `/api/trpc/realInsar.getStatus?input={taskId}` |
| `realInsar.getLogs` | GET | 获取日志 | `/api/trpc/realInsar.getLogs?input={taskId,offset,limit}` |
| `realInsar.cancelProcessing` | POST | 取消处理 | `/api/trpc/realInsar.cancelProcessing` |
| `realInsar.getResult` | GET | 获取结果 | `/api/trpc/realInsar.getResult?input={taskId}` |
| `realInsar.listTasks` | GET | 列出任务 | `/api/trpc/realInsar.listTasks` |

### 4.2 数据可用性检查 API

| 端点 | 方法 | 作用 | 调用 URL |
|------|------|------|----------|
| `realInsar.checkDataAvailability` | GET | 检查数据可用性 | `/api/trpc/realInsar.checkDataAvailability?input={bounds,startDate,endDate,...}` |

### 4.3 数据库相关 API

| 端点 | 方法 | 作用 | 调用 URL |
|------|------|------|----------|
| `realInsar.getProjectSteps` | GET | 获取步骤 | `/api/trpc/realInsar.getProjectSteps?input={projectId}` |
| `realInsar.getProjectLogs` | GET | 获取日志 | `/api/trpc/realInsar.getProjectLogs?input={projectId}` |
| `realInsar.getProjectResults` | GET | 获取结果 | `/api/trpc/realInsar.getProjectResults?input={projectId}` |

---

## 五、数据库表结构

### 5.1 相关表

| 表名 | 作用 | 文件位置 |
|------|------|----------|
| `insar_projects` | 项目信息 | `drizzle/schema.ts` |
| `processing_steps` | 处理步骤状态 | `drizzle/schema.ts` |
| `processing_logs` | 处理日志 | `drizzle/schema.ts` |
| `processing_results` | 处理结果 | `drizzle/schema.ts` |

### 5.2 数据流向

```
处理开始
    │
    ├── 更新 insar_projects.status = "processing"
    │
    ├── 创建 processing_steps 记录（8 个步骤）
    │
    ├── 处理过程中
    │       │
    │       ├── 插入 processing_logs（实时日志）
    │       │
    │       └── 更新 processing_steps.status/progress
    │
    └── 处理完成
            │
            ├── 插入 processing_results（输出文件）
            │
            └── 更新 insar_projects.status = "completed"
```

---

## 六、外部服务调用

### 6.1 ASF (Alaska Satellite Facility)

**数据搜索 API**:
```
GET https://api.daac.asf.alaska.edu/services/search/param
Headers: Authorization: Bearer ${ASF_API_TOKEN}
Parameters:
  - platform: Sentinel-1
  - processingLevel: SLC
  - beamMode: IW
  - bbox: west,south,east,north
  - start: YYYY-MM-DD
  - end: YYYY-MM-DD
  - maxResults: 10
  - output: json
```

**数据下载**:
```
GET https://datapool.asf.alaska.edu/SLC/SA/${filename}.zip
Headers: Authorization: Bearer ${ASF_API_TOKEN}
```

### 6.2 环境变量

| 变量名 | 作用 | 必需 |
|--------|------|------|
| `ASF_API_TOKEN` | ASF API 认证令牌 | 是 |
| `DATABASE_URL` | 数据库连接字符串 | 是 |

---

## 七、完整调用序列图

```
用户                前端                    tRPC                后端                  处理器              ASF API
 │                   │                       │                   │                     │                   │
 │  点击"开始处理"   │                       │                   │                     │                   │
 │──────────────────>│                       │                   │                     │                   │
 │                   │                       │                   │                     │                   │
 │                   │  mutateAsync()        │                   │                     │                   │
 │                   │──────────────────────>│                   │                     │                   │
 │                   │                       │                   │                     │                   │
 │                   │                       │  startProcessing  │                     │                   │
 │                   │                       │──────────────────>│                     │                   │
 │                   │                       │                   │                     │                   │
 │                   │                       │                   │  new Processor()    │                   │
 │                   │                       │                   │────────────────────>│                   │
 │                   │                       │                   │                     │                   │
 │                   │                       │                   │  processor.process()│                   │
 │                   │                       │                   │────────────────────>│                   │
 │                   │                       │                   │                     │                   │
 │                   │                       │  { taskId }       │                     │  searchSentinel1  │
 │                   │                       │<──────────────────│                     │──────────────────>│
 │                   │                       │                   │                     │                   │
 │                   │  { taskId }           │                   │                     │  [搜索结果]       │
 │                   │<──────────────────────│                   │                     │<──────────────────│
 │                   │                       │                   │                     │                   │
 │                   │  startPolling()       │                   │                     │  downloadSLCData  │
 │                   │──────────────────────>│                   │                     │──────────────────>│
 │                   │                       │                   │                     │                   │
 │                   │                       │  getStatus        │                     │  [下载数据]       │
 │                   │                       │──────────────────>│                     │<──────────────────│
 │                   │                       │                   │                     │                   │
 │                   │                       │  { status, ... }  │                     │  ... 后续步骤 ... │
 │                   │                       │<──────────────────│                     │                   │
 │                   │                       │                   │                     │                   │
 │  更新 UI 状态     │                       │                   │                     │                   │
 │<──────────────────│                       │                   │                     │                   │
 │                   │                       │                   │                     │                   │
```

---

## 八、关键代码位置索引

| 功能 | 文件 | 行号 |
|------|------|------|
| 处理按钮点击 | `app/project/[id].tsx` | 346-428 |
| 状态轮询 | `app/project/[id].tsx` | 266-336 |
| tRPC 客户端 | `lib/trpc.ts` | 21-42 |
| 路由定义 | `server/routers.ts` | 10-12 |
| realInsarRouter | `server/real-insar-routes.ts` | 753-900 |
| startRealProcessing | `server/real-insar-routes.ts` | 172-340 |
| RealInSARProcessor | `server/real-insar-processor.ts` | 217-308 |
| ASF 数据搜索 | `server/real-insar-processor.ts` | 314-400 |
| 数据库操作 | `server/db.ts` | 全文件 |
| 表结构定义 | `drizzle/schema.ts` | 全文件 |

---

**文档版本**: 1.0  
**最后更新**: 2026-01-16  
**作者**: Manus AI
