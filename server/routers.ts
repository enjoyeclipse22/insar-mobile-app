import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  insar: router({
    listProjects: protectedProcedure.query(({ ctx }) => db.getUserProjects(ctx.user.id)),
    getProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectById(input.projectId)),
    createProject: protectedProcedure
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
        userId: ctx.user.id,
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
    updateProject: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().optional(),
        status: z.enum(["created", "processing", "completed", "failed"]).optional(),
        progress: z.number().optional(),
      }))
      .mutation(({ input }) => db.updateProject(input.projectId, {
        name: input.name,
        status: input.status,
        progress: input.progress,
      })),
    deleteProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(({ input }) => db.deleteProject(input.projectId)),
    getSteps: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectSteps(input.projectId)),
    getResults: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectResults(input.projectId)),
    getLogs: protectedProcedure
      .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => db.getProjectLogs(input.projectId, input.limit)),
  }),
});

export type AppRouter = typeof appRouter;
