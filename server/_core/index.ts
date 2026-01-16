import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // 静态文件服务 - 提供 InSAR 处理生成的图像
  const insarOutputDir = "/tmp/insar-processing";
  app.use("/api/insar-output", (req, res, next) => {
    // 确保目录存在
    if (!fs.existsSync(insarOutputDir)) {
      fs.mkdirSync(insarOutputDir, { recursive: true });
    }
    express.static(insarOutputDir)(req, res, next);
  });

  // 获取任务生成的图像列表
  app.get("/api/insar-images/:taskId", (req, res) => {
    const taskId = req.params.taskId;
    const taskDir = path.join(insarOutputDir, taskId);
    
    if (!fs.existsSync(taskDir)) {
      return res.json({ success: false, error: "任务目录不存在", images: [] });
    }

    const images: Array<{
      type: string;
      name: string;
      path: string;
      url: string;
    }> = [];

    // 遍历任务目录查找图像文件
    const findImages = (dir: string, baseUrl: string) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          findImages(filePath, `${baseUrl}/${file}`);
        } else if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) {
          let type = "unknown";
          if (file.includes("dem")) type = "dem";
          else if (file.includes("interferogram") || file.includes("ifg")) type = "interferogram";
          else if (file.includes("coherence") || file.includes("coh")) type = "coherence";
          else if (file.includes("unwrap")) type = "unwrapped_phase";
          else if (file.includes("deformation") || file.includes("defo")) type = "deformation";
          
          images.push({
            type,
            name: file,
            path: filePath,
            url: `/api/insar-output/${taskId}${baseUrl}/${file}`,
          });
        }
      }
    };

    findImages(taskDir, "");

    return res.json({
      success: true,
      taskId,
      images,
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
