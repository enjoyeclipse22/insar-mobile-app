import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { realInsarRouter } from "./real-insar-routes";

export const appRouter = router({
  system: systemRouter,
  realInsar: realInsarRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  insar: router({
    // 项目列表
    listProjects: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      return db.getUserProjects(userId);
    }),
    
    // 获取单个项目
    getProject: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectById(input.projectId)),
    
    // 创建项目
    createProject: publicProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        satellite: z.string().optional(),
        orbitDirection: z.enum(["ascending", "descending"]).optional(),
        polarization: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => db.createProject({
        userId: ctx.user?.id || 1,
        name: input.name,
        description: input.description,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        satellite: input.satellite,
        orbitDirection: input.orbitDirection,
        polarization: input.polarization,
        status: "created",
        progress: 0,
      })),
    
    // 更新项目
    updateProject: publicProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        satellite: z.string().optional(),
        orbitDirection: z.enum(["ascending", "descending"]).optional(),
        polarization: z.string().optional(),
        status: z.enum(["created", "processing", "completed", "failed"]).optional(),
        progress: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const updateData: Record<string, any> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.location !== undefined) updateData.location = input.location;
        if (input.startDate !== undefined) updateData.startDate = input.startDate;
        if (input.endDate !== undefined) updateData.endDate = input.endDate;
        if (input.satellite !== undefined) updateData.satellite = input.satellite;
        if (input.orbitDirection !== undefined) updateData.orbitDirection = input.orbitDirection;
        if (input.polarization !== undefined) updateData.polarization = input.polarization;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.progress !== undefined) updateData.progress = input.progress;
        return db.updateProject(input.projectId, updateData);
      }),
    
    // 删除项目
    deleteProject: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(({ input }) => db.deleteProject(input.projectId)),
    
    // 数据管理端点
    getCacheInfo: publicProcedure.query(() => {
      return {
        total_files: 0,
        total_size: 0,
        total_size_formatted: "0 B",
        files: [],
      };
    }),
    
    deleteCacheFile: publicProcedure
      .input(z.object({ filePath: z.string() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),
    
    clearCache: publicProcedure.mutation(async () => {
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
