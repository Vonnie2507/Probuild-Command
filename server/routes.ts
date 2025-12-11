import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createServiceM8Client } from "./servicem8";
import { insertJobSchema, insertStaffSchema, type InsertStaff } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get all jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get a single job
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Update a job
  app.patch("/api/jobs/:id", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const partialJob = req.body;
      const updatedJob = await storage.updateJob(jobId, partialJob);
      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(updatedJob);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // Get all staff
  app.get("/api/staff", async (req, res) => {
    try {
      const members = await storage.getAllStaff();
      res.json(members);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Create staff member
  app.post("/api/staff", async (req, res) => {
    try {
      const validatedStaff = insertStaffSchema.parse(req.body) as InsertStaff;
      const member = await storage.createStaffMember(validatedStaff);
      res.status(201).json(member);
    } catch (error) {
      console.error("Error creating staff member:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create staff member" });
    }
  });

  // Update staff member
  app.patch("/api/staff/:id", async (req, res) => {
    try {
      const staffId = req.params.id;
      const updatedMember = await storage.updateStaffMember(staffId, req.body);
      if (!updatedMember) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating staff member:", error);
      res.status(500).json({ error: "Failed to update staff member" });
    }
  });

  // Sync with ServiceM8
  app.post("/api/sync/servicem8", async (req, res) => {
    try {
      const sm8Client = createServiceM8Client();
      if (!sm8Client) {
        return res.status(400).json({ 
          error: "ServiceM8 not configured. Please set SERVICEM8_API_KEY environment variable." 
        });
      }

      const syncLog = await storage.createSyncLog({
        syncType: "manual",
        status: "in_progress",
        startedAt: new Date(),
        jobsProcessed: 0,
      });

      let jobsProcessed = 0;
      let errorMessage = null;

      try {
        const sm8Jobs = await sm8Client.fetchJobs();
        
        for (const sm8Job of sm8Jobs) {
          const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job);
          await storage.upsertJobByServiceM8Uuid(mappedJob);
          jobsProcessed++;
        }

        await storage.updateSyncLog(syncLog.id, {
          status: "success",
          jobsProcessed,
          completedAt: new Date(),
        });

        res.json({ 
          success: true, 
          jobsProcessed,
          message: `Successfully synced ${jobsProcessed} jobs from ServiceM8` 
        });
      } catch (syncError: any) {
        errorMessage = syncError.message;
        
        await storage.updateSyncLog(syncLog.id, {
          status: "error",
          jobsProcessed,
          errorMessage,
          completedAt: new Date(),
        });

        res.status(500).json({ 
          error: "ServiceM8 sync failed",
          message: errorMessage,
          jobsProcessed 
        });
      }
    } catch (error: any) {
      console.error("Error during ServiceM8 sync:", error);
      res.status(500).json({ error: "Failed to sync with ServiceM8", message: error.message });
    }
  });

  // Get sync status
  app.get("/api/sync/status", async (req, res) => {
    try {
      const latestSync = await storage.getLatestSyncLog();
      res.json(latestSync || { message: "No sync history" });
    } catch (error) {
      console.error("Error fetching sync status:", error);
      res.status(500).json({ error: "Failed to fetch sync status" });
    }
  });

  return httpServer;
}
