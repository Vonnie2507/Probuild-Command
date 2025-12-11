import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createServiceM8Client } from "./servicem8";
import { insertJobSchema, insertStaffSchema, type InsertStaff } from "@shared/schema";
import { z } from "zod";

// ServiceM8 OAuth 2.0 Configuration
const SM8_OAUTH_CONFIG = {
  authorizeUrl: "https://go.servicem8.com/oauth/authorize",
  tokenUrl: "https://go.servicem8.com/oauth/access_token",
  clientId: process.env.SERVICEM8_CLIENT_ID || "",
  clientSecret: process.env.SERVICEM8_CLIENT_SECRET || "",
  scopes: "read_jobs read_schedule manage_schedule read_messages read_job_notes read_staff read_clients",
};

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
        // Bulk fetch all data in parallel for speed
        const [sm8Jobs, contactMap, companyMap] = await Promise.all([
          sm8Client.fetchJobs(),
          sm8Client.fetchAllJobContacts(),
          sm8Client.fetchAllCompanies()
        ]);
        
        for (const sm8Job of sm8Jobs) {
          // Get customer name from cached contact map, then company map
          let customerName = "Unknown Customer";
          const contact = contactMap.get(sm8Job.uuid);
          if (contact && (contact.first || contact.last)) {
            customerName = `${contact.first} ${contact.last}`.trim();
          } else if (sm8Job.company_uuid) {
            const companyName = companyMap.get(sm8Job.company_uuid);
            if (companyName) {
              customerName = companyName;
            }
          }
          
          const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job, customerName);
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

  // ============ ServiceM8 OAuth 2.0 Routes ============

  // Get OAuth status (check if we have a valid token)
  app.get("/api/auth/servicem8/status", async (req, res) => {
    try {
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.json({ connected: false, message: "Not connected to ServiceM8 OAuth" });
      }
      
      const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
      res.json({ 
        connected: !isExpired,
        expiresAt: token.expiresAt,
        scope: token.scope,
        message: isExpired ? "Token expired, please reconnect" : "Connected to ServiceM8"
      });
    } catch (error) {
      console.error("Error checking OAuth status:", error);
      res.status(500).json({ error: "Failed to check OAuth status" });
    }
  });

  // Start OAuth flow - redirect to ServiceM8 authorization
  app.get("/api/auth/servicem8/login", (req, res) => {
    if (!SM8_OAUTH_CONFIG.clientId) {
      return res.status(400).json({ error: "ServiceM8 OAuth not configured. Missing SERVICEM8_CLIENT_ID." });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/servicem8/callback`;
    const authUrl = new URL(SM8_OAUTH_CONFIG.authorizeUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", SM8_OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", SM8_OAUTH_CONFIG.scopes);

    console.log("Redirecting to ServiceM8 OAuth:", authUrl.toString());
    res.redirect(authUrl.toString());
  });

  // OAuth callback - exchange code for tokens
  app.get("/api/auth/servicem8/callback", async (req, res) => {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      console.error("OAuth error:", oauthError);
      return res.redirect("/?oauth_error=" + encodeURIComponent(String(oauthError)));
    }

    if (!code) {
      return res.redirect("/?oauth_error=no_code");
    }

    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/servicem8/callback`;
      
      const tokenResponse = await fetch(SM8_OAUTH_CONFIG.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(code),
          client_id: SM8_OAUTH_CONFIG.clientId,
          client_secret: SM8_OAUTH_CONFIG.clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Token exchange failed:", tokenResponse.status, errorText);
        return res.redirect("/?oauth_error=token_exchange_failed");
      }

      const tokenData = await tokenResponse.json();
      console.log("OAuth token received successfully");

      // Calculate expiry time
      const expiresAt = tokenData.expires_in 
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null;

      // Save tokens to database
      await storage.saveOAuthToken({
        provider: "servicem8",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: expiresAt,
        scope: SM8_OAUTH_CONFIG.scopes,
      });

      res.redirect("/?oauth_success=true");
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/?oauth_error=callback_failed");
    }
  });

  // Fetch Job Activity/Diary using OAuth token
  app.get("/api/servicem8/job-activity/:jobUuid", async (req, res) => {
    try {
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth. Please connect first." });
      }

      const { jobUuid } = req.params;
      const response = await fetch(
        `https://api.servicem8.com/api_1.0/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'`,
        {
          headers: {
            "Authorization": `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          return res.status(401).json({ error: "OAuth token expired. Please reconnect." });
        }
        throw new Error(`API Error: ${response.status}`);
      }

      const activities = await response.json();
      res.json(activities);
    } catch (error: any) {
      console.error("Error fetching job activity:", error);
      res.status(500).json({ error: "Failed to fetch job activity", message: error.message });
    }
  });

  // Fetch Job Notes using OAuth token
  app.get("/api/servicem8/job-notes/:jobUuid", async (req, res) => {
    try {
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth. Please connect first." });
      }

      const { jobUuid } = req.params;
      const response = await fetch(
        `https://api.servicem8.com/api_1.0/note.json?%24filter=related_object%20eq%20'job'%20and%20related_object_uuid%20eq%20'${jobUuid}'`,
        {
          headers: {
            "Authorization": `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Notes API error:", response.status, errorText);
        throw new Error(`API Error: ${response.status}`);
      }

      const notes = await response.json();
      res.json(notes);
    } catch (error: any) {
      console.error("Error fetching job notes:", error);
      res.status(500).json({ error: "Failed to fetch job notes", message: error.message });
    }
  });

  // Fetch all notes from ServiceM8 (for testing/debugging)
  app.get("/api/servicem8/all-notes", async (req, res) => {
    try {
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth." });
      }

      const response = await fetch(
        `https://api.servicem8.com/api_1.0/note.json?%24top=50`,
        {
          headers: {
            "Authorization": `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("All notes API error:", response.status, errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const notes = await response.json();
      res.json({ count: notes.length, notes });
    } catch (error: any) {
      console.error("Error fetching all notes:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch combined job communication history (activities + notes)
  app.get("/api/servicem8/job-history/:jobUuid", async (req, res) => {
    try {
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth. Please connect first." });
      }

      const { jobUuid } = req.params;
      
      // Fetch both activities and notes in parallel
      const [activitiesRes, notesRes] = await Promise.all([
        fetch(
          `https://api.servicem8.com/api_1.0/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'`,
          {
            headers: {
              "Authorization": `Bearer ${token.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        ),
        fetch(
          `https://api.servicem8.com/api_1.0/note.json?%24filter=related_object%20eq%20'job'%20and%20related_object_uuid%20eq%20'${jobUuid}'`,
          {
            headers: {
              "Authorization": `Bearer ${token.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        )
      ]);

      const activities = activitiesRes.ok ? await activitiesRes.json() : [];
      const notes = notesRes.ok ? await notesRes.json() : [];

      res.json({
        activities,
        notes,
        totalItems: activities.length + notes.length
      });
    } catch (error: any) {
      console.error("Error fetching job history:", error);
      res.status(500).json({ error: "Failed to fetch job history", message: error.message });
    }
  });

  return httpServer;
}

// Auto-sync function that runs periodically
async function runAutoSync() {
  try {
    const sm8Client = createServiceM8Client();
    if (!sm8Client) {
      console.log("[AutoSync] ServiceM8 not configured, skipping sync");
      return;
    }

    console.log("[AutoSync] Starting automatic sync...");
    
    const syncLog = await storage.createSyncLog({
      syncType: "automatic",
      status: "in_progress",
      startedAt: new Date(),
      jobsProcessed: 0,
    });

    let jobsProcessed = 0;

    try {
      const [sm8Jobs, contactMap, companyMap] = await Promise.all([
        sm8Client.fetchJobs(),
        sm8Client.fetchAllJobContacts(),
        sm8Client.fetchAllCompanies()
      ]);
      
      for (const sm8Job of sm8Jobs) {
        let customerName = "Unknown Customer";
        const contact = contactMap.get(sm8Job.uuid);
        if (contact && (contact.first || contact.last)) {
          customerName = `${contact.first} ${contact.last}`.trim();
        } else if (sm8Job.company_uuid) {
          const companyName = companyMap.get(sm8Job.company_uuid);
          if (companyName) {
            customerName = companyName;
          }
        }
        
        const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job, customerName);
        await storage.upsertJobByServiceM8Uuid(mappedJob);
        jobsProcessed++;
      }

      await storage.updateSyncLog(syncLog.id, {
        status: "success",
        jobsProcessed,
        completedAt: new Date(),
      });

      console.log(`[AutoSync] Successfully synced ${jobsProcessed} jobs`);
    } catch (syncError: any) {
      console.error("[AutoSync] Error:", syncError.message);
      await storage.updateSyncLog(syncLog.id, {
        status: "error",
        jobsProcessed,
        errorMessage: syncError.message,
        completedAt: new Date(),
      });
    }
  } catch (error: any) {
    console.error("[AutoSync] Failed:", error.message);
  }
}

// Start auto-sync with configurable interval (default: 15 minutes)
export function startAutoSync(intervalMinutes: number = 15) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  // Run initial sync after 10 seconds (give server time to start)
  setTimeout(() => {
    runAutoSync();
  }, 10000);
  
  // Then run every intervalMinutes
  setInterval(() => {
    runAutoSync();
  }, intervalMs);
  
  console.log(`[AutoSync] Scheduled to run every ${intervalMinutes} minutes`);
}
