import { describe, it, expect } from "vitest";

describe("InSAR API Tests", () => {
  const API_BASE = "http://127.0.0.1:3000";
  
  it("should get project by ID", async () => {
    const projectId = 60002;
    const url = `${API_BASE}/api/trpc/insar.getProject?input=${encodeURIComponent(JSON.stringify({ json: { projectId } }))}`;
    
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.result?.data?.json).toBeDefined();
    expect(data.result.data.json.id).toBe(projectId);
    expect(data.result.data.json.name).toBe("成都");
  });
  
  it("should list all projects", async () => {
    const url = `${API_BASE}/api/trpc/insar.listProjects?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`;
    
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.result?.data?.json).toBeDefined();
    expect(Array.isArray(data.result.data.json)).toBe(true);
    expect(data.result.data.json.length).toBeGreaterThan(0);
  });
  
  it("should start processing for a project", async () => {
    const projectId = 60002;
    const url = `${API_BASE}/api/trpc/realInsar.startProcessing`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          projectId,
          bounds: {
            north: 31.44,
            south: 30.09,
            east: 104.89,
            west: 102.99,
          },
          startDate: "2024-10-16",
          endDate: "2026-01-16",
          satellite: "S1A",
          orbitDirection: "ascending",
          polarization: "VV",
        },
      }),
    });
    
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.result?.data?.json?.taskId).toBeDefined();
  });
  
  it("should get processing status with taskId", async () => {
    // First start processing to get a taskId
    const projectId = 60002;
    const startUrl = `${API_BASE}/api/trpc/realInsar.startProcessing`;
    
    const startResponse = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          projectId,
          bounds: {
            north: 31.44,
            south: 30.09,
            east: 104.89,
            west: 102.99,
          },
          startDate: "2024-10-16",
          endDate: "2026-01-16",
          satellite: "S1A",
          orbitDirection: "ascending",
          polarization: "VV",
        },
      }),
    });
    
    const startData = await startResponse.json();
    const taskId = startData.result?.data?.json?.taskId;
    expect(taskId).toBeDefined();
    
    // Now get status with taskId
    const statusUrl = `${API_BASE}/api/trpc/realInsar.getStatus?input=${encodeURIComponent(JSON.stringify({ json: { taskId } }))}`;
    
    const response = await fetch(statusUrl);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.result?.data?.json).toBeDefined();
  });
  
  it("should get processing logs with taskId", async () => {
    // First start processing to get a taskId
    const projectId = 60002;
    const startUrl = `${API_BASE}/api/trpc/realInsar.startProcessing`;
    
    const startResponse = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          projectId,
          bounds: {
            north: 31.44,
            south: 30.09,
            east: 104.89,
            west: 102.99,
          },
          startDate: "2024-10-16",
          endDate: "2026-01-16",
          satellite: "S1A",
          orbitDirection: "ascending",
          polarization: "VV",
        },
      }),
    });
    
    const startData = await startResponse.json();
    const taskId = startData.result?.data?.json?.taskId;
    expect(taskId).toBeDefined();
    
    // Now get logs with taskId
    const logsUrl = `${API_BASE}/api/trpc/realInsar.getLogs?input=${encodeURIComponent(JSON.stringify({ json: { taskId } }))}`;
    
    const response = await fetch(logsUrl);
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.result?.data?.json).toBeDefined();
    // logs is inside json.logs, not json itself
    expect(data.result.data.json.logs).toBeDefined();
    expect(Array.isArray(data.result.data.json.logs)).toBe(true);
  });
});
