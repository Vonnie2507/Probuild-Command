import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createServiceM8Client } from "./servicem8";
import { insertJobSchema, insertStaffSchema, type InsertStaff, insertWorkTypeSchema, insertWorkTypeStageSchema } from "@shared/schema";
import { z } from "zod";

// ServiceM8 OAuth 2.0 Configuration
const SM8_OAUTH_CONFIG = {
  authorizeUrl: "https://go.servicem8.com/oauth/authorize",
  tokenUrl: "https://go.servicem8.com/oauth/access_token",
  clientId: process.env.SERVICEM8_APP_ID || process.env.SERVICEM8_CLIENT_ID || "",
  clientSecret: process.env.SERVICEM8_APP_SECRET || process.env.SERVICEM8_CLIENT_SECRET || "",
  scopes: "read_jobs read_schedule manage_schedule read_job_notes read_staff read_customers",
};


// Helper function to get a valid OAuth token, refreshing if needed
async function getValidOAuthToken(): Promise<{ accessToken: string } | null> {
  const token = await storage.getOAuthToken("servicem8");
  if (!token) return null;
  
  const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
  
  if (isExpired && token.refreshToken) {
    console.log("OAuth token expired, attempting refresh...");
    try {
      const refreshResponse = await fetch(SM8_OAUTH_CONFIG.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
          client_id: SM8_OAUTH_CONFIG.clientId,
          client_secret: SM8_OAUTH_CONFIG.clientSecret,
        }),
      });
      
      if (refreshResponse.ok) {
        const newTokenData = await refreshResponse.json();
        const expiresAt = newTokenData.expires_in 
          ? new Date(Date.now() + newTokenData.expires_in * 1000)
          : null;
        
        await storage.saveOAuthToken({
          provider: "servicem8",
          accessToken: newTokenData.access_token,
          refreshToken: newTokenData.refresh_token || token.refreshToken,
          expiresAt: expiresAt,
          scope: SM8_OAUTH_CONFIG.scopes,
        });
        
        console.log("OAuth token refreshed successfully");
        return { accessToken: newTokenData.access_token };
      } else {
        console.error("Token refresh failed:", await refreshResponse.text());
        return null;
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
      return null;
    }
  }
  
  return isExpired ? null : { accessToken: token.accessToken };
}

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
        // Bulk fetch all data in parallel for speed (including custom fields for staff assignment)
        const [sm8Jobs, contactMap, companyMap, customFieldMap, notesMap] = await Promise.all([
          sm8Client.fetchJobs(),
          sm8Client.fetchAllJobContacts(),
          sm8Client.fetchAllCompanies(),
          sm8Client.fetchAllJobCustomFields(),
          sm8Client.fetchAllJobNotes()
        ]);
        
        for (const sm8Job of sm8Jobs) {
          // Get customer name: prioritize company name, then job contact
          let customerName = "Unknown Customer";
          
          // First try company name (this is the main customer record in ServiceM8)
          if (sm8Job.company_uuid) {
            const companyName = companyMap.get(sm8Job.company_uuid);
            if (companyName) {
              customerName = companyName;
            }
          }
          
          // Fall back to job contact name if no company
          if (customerName === "Unknown Customer") {
            const contact = contactMap.get(sm8Job.uuid);
            if (contact && (contact.first || contact.last)) {
              customerName = `${contact.first} ${contact.last}`.trim();
            }
          }
          
          const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job, customerName, customFieldMap);
          
          // Add communication history from notes
          const lastComm = notesMap.get(sm8Job.uuid);
          if (lastComm) {
            (mappedJob as any).lastCommunicationDate = lastComm.date;
            (mappedJob as any).lastCommunicationType = lastComm.type;
            // Also update daysSinceLastContact based on communication
            const daysSince = Math.floor((Date.now() - lastComm.date.getTime()) / (1000 * 60 * 60 * 24));
            mappedJob.daysSinceLastContact = daysSince;
          }
          
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

  // Debug endpoint to test custom fields API
  app.get("/api/debug/custom-fields", async (req, res) => {
    try {
      const sm8Client = createServiceM8Client();
      if (!sm8Client) {
        return res.status(400).json({ error: "ServiceM8 not configured" });
      }
      
      const customFieldMap = await sm8Client.fetchAllJobCustomFields();
      
      // Convert Map to object for JSON response
      const result: Record<string, any> = {};
      customFieldMap.forEach((value, key) => {
        result[key] = value;
      });
      
      res.json({
        totalJobs: customFieldMap.size,
        customFields: result
      });
    } catch (error: any) {
      console.error("Error fetching custom fields:", error);
      res.status(500).json({ error: error.message });
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

  // Helper to get proper protocol (handles reverse proxy)
  const getBaseUrl = (req: any) => {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    return `https://${req.get('host')}`;
  };

  // Start OAuth flow - redirect to ServiceM8 authorization (API route)
  app.get("/api/auth/servicem8/login", (req, res) => {
    if (!SM8_OAUTH_CONFIG.clientId) {
      return res.status(400).json({ error: "ServiceM8 OAuth not configured. Missing SERVICEM8_CLIENT_ID." });
    }

    const redirectUri = `${getBaseUrl(req)}/auth/servicem8/callback`;
    const authUrl = new URL(SM8_OAUTH_CONFIG.authorizeUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", SM8_OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", SM8_OAUTH_CONFIG.scopes);

    console.log("Redirecting to ServiceM8 OAuth:", authUrl.toString());
    res.redirect(authUrl.toString());
  });

  // ServiceM8 addon activation URL - starts OAuth flow
  app.get("/connect/servicem8", (req, res) => {
    if (!SM8_OAUTH_CONFIG.clientId) {
      return res.status(400).send("ServiceM8 OAuth not configured. Missing SERVICEM8_CLIENT_ID.");
    }

    const redirectUri = `${getBaseUrl(req)}/auth/servicem8/callback`;
    const authUrl = new URL(SM8_OAUTH_CONFIG.authorizeUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", SM8_OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", SM8_OAUTH_CONFIG.scopes);

    console.log("ServiceM8 addon connect - redirecting to OAuth:", authUrl.toString());
    res.redirect(authUrl.toString());
  });

  // OAuth callback - exchange code for tokens (non-API route for ServiceM8 addon)
  app.get("/auth/servicem8/callback", async (req, res) => {
    console.log("OAuth callback received:", req.query);
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      console.error("OAuth error:", oauthError);
      return res.redirect("/?oauth_error=" + encodeURIComponent(String(oauthError)));
    }

    if (!code) {
      console.error("No code in OAuth callback");
      return res.redirect("/?oauth_error=no_code");
    }

    try {
      const redirectUri = `${getBaseUrl(req)}/auth/servicem8/callback`;
      
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
      console.log("OAuth token received:", JSON.stringify({
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        error: tokenData.error,
        errorDescription: tokenData.error_description
      }));

      if (!tokenData.access_token) {
        console.error("No access token in response:", tokenData);
        return res.redirect("/?oauth_error=no_access_token");
      }

      const expiresAt = tokenData.expires_in 
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null;

      console.log("Saving OAuth token to database...");
      await storage.saveOAuthToken({
        provider: "servicem8",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: expiresAt,
        scope: SM8_OAUTH_CONFIG.scopes,
      });
      console.log("OAuth token saved successfully!");

      res.redirect("/?oauth_success=true");
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/?oauth_error=callback_failed");
    }
  });

  // OAuth callback - API route (redirects to non-API route)
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
      const redirectUri = `${getBaseUrl(req)}/api/auth/servicem8/callback`;
      
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

  // Debug endpoint to check OAuth config (runtime values)
  app.get("/api/debug/oauth-config", (req, res) => {
    res.json({
      clientIdPresent: !!SM8_OAUTH_CONFIG.clientId,
      clientIdLength: SM8_OAUTH_CONFIG.clientId?.length || 0,
      appIdEnv: !!process.env.SERVICEM8_APP_ID,
      clientIdEnv: !!process.env.SERVICEM8_CLIENT_ID,
      appSecretEnv: !!process.env.SERVICEM8_APP_SECRET,
      clientSecretEnv: !!process.env.SERVICEM8_CLIENT_SECRET,
    });
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

  // Fetch Job Notes using OAuth token (with auto-refresh)
  app.get("/api/servicem8/job-notes/:jobUuid", async (req, res) => {
    try {
      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ error: "ServiceM8 token expired or not connected. Please reconnect via Settings." });
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
        if (response.status === 401) {
          return res.status(401).json({ error: "ServiceM8 token expired. Please reconnect via Settings." });
        }
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

  // Debug endpoint to check raw job data from ServiceM8
  app.get("/api/servicem8/raw-job/:jobId", async (req, res) => {
    try {
      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth." });
      }

      const { jobId } = req.params;
      // Find job by generated_job_id
      const response = await fetch(
        `https://api.servicem8.com/api_1.0/job.json?%24filter=generated_job_id%20eq%20'${jobId}'`,
        {
          headers: {
            "Authorization": `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const jobs = await response.json();
      if (jobs.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Return raw job with quote fields highlighted
      const job = jobs[0];
      res.json({
        generated_job_id: job.generated_job_id,
        status: job.status,
        quote_date: job.quote_date,
        quote_sent: job.quote_sent,
        edit_date: job.edit_date,
        date: job.date,
        completion_date: job.completion_date,
        all_fields: job
      });
    } catch (error: any) {
      console.error("Error fetching raw job:", error);
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

  // ============== WORK TYPES API ==============
  
  // Get all work types
  app.get("/api/work-types", async (req, res) => {
    try {
      const workTypes = await storage.getAllWorkTypes();
      res.json(workTypes);
    } catch (error) {
      console.error("Error fetching work types:", error);
      res.status(500).json({ error: "Failed to fetch work types" });
    }
  });

  // Get a single work type with its stages
  app.get("/api/work-types/:id", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.id);
      const workType = await storage.getWorkType(workTypeId);
      if (!workType) {
        return res.status(404).json({ error: "Work type not found" });
      }
      const stages = await storage.getStagesForWorkType(workTypeId);
      res.json({ ...workType, stages });
    } catch (error) {
      console.error("Error fetching work type:", error);
      res.status(500).json({ error: "Failed to fetch work type" });
    }
  });

  // Create a work type
  app.post("/api/work-types", async (req, res) => {
    try {
      const validated = insertWorkTypeSchema.parse(req.body);
      const workType = await storage.createWorkType(validated);
      res.status(201).json(workType);
    } catch (error) {
      console.error("Error creating work type:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create work type" });
    }
  });

  // Update a work type
  app.patch("/api/work-types/:id", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.id);
      const updated = await storage.updateWorkType(workTypeId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Work type not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating work type:", error);
      res.status(500).json({ error: "Failed to update work type" });
    }
  });

  // Delete a work type
  app.delete("/api/work-types/:id", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.id);
      await storage.deleteWorkType(workTypeId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting work type:", error);
      res.status(500).json({ error: "Failed to delete work type" });
    }
  });

  // ============== WORK TYPE STAGES API ==============

  // Get stages for a work type
  app.get("/api/work-types/:workTypeId/stages", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.workTypeId);
      const stages = await storage.getStagesForWorkType(workTypeId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching stages:", error);
      res.status(500).json({ error: "Failed to fetch stages" });
    }
  });

  // Create a stage for a work type
  app.post("/api/work-types/:workTypeId/stages", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.workTypeId);
      const validated = insertWorkTypeStageSchema.parse({ ...req.body, workTypeId });
      const stage = await storage.createWorkTypeStage(validated);
      res.status(201).json(stage);
    } catch (error) {
      console.error("Error creating stage:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create stage" });
    }
  });

  // Update a stage
  app.patch("/api/work-types/:workTypeId/stages/:stageId", async (req, res) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const updated = await storage.updateWorkTypeStage(stageId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating stage:", error);
      res.status(500).json({ error: "Failed to update stage" });
    }
  });

  // Delete a stage
  app.delete("/api/work-types/:workTypeId/stages/:stageId", async (req, res) => {
    try {
      const stageId = parseInt(req.params.stageId);
      await storage.deleteWorkTypeStage(stageId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting stage:", error);
      res.status(500).json({ error: "Failed to delete stage" });
    }
  });

  // Reorder stages
  app.post("/api/work-types/:workTypeId/stages/reorder", async (req, res) => {
    try {
      const workTypeId = parseInt(req.params.workTypeId);
      const { stageIds } = req.body;
      if (!Array.isArray(stageIds)) {
        return res.status(400).json({ error: "stageIds must be an array" });
      }
      await storage.reorderStages(workTypeId, stageIds);
      const stages = await storage.getStagesForWorkType(workTypeId);
      res.json(stages);
    } catch (error) {
      console.error("Error reordering stages:", error);
      res.status(500).json({ error: "Failed to reorder stages" });
    }
  });

  // ============== JOB STAGE PROGRESS API ==============

  // Get stage progress for a job
  app.get("/api/jobs/:jobId/stage-progress", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const progress = await storage.getJobStageProgress(jobId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching job stage progress:", error);
      res.status(500).json({ error: "Failed to fetch job stage progress" });
    }
  });

  // Update stage progress for a job
  app.patch("/api/jobs/:jobId/stage-progress/:stageId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      const updated = await storage.updateJobStageProgress(jobId, stageId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Stage progress not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating job stage progress:", error);
      res.status(500).json({ error: "Failed to update job stage progress" });
    }
  });

  // Initialize stages for a job when work type is assigned
  app.post("/api/jobs/:jobId/initialize-stages", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const { workTypeId } = req.body;
      if (!workTypeId) {
        return res.status(400).json({ error: "workTypeId is required" });
      }
      await storage.initializeJobStages(jobId, workTypeId);
      const progress = await storage.getJobStageProgress(jobId);
      res.json(progress);
    } catch (error) {
      console.error("Error initializing job stages:", error);
      res.status(500).json({ error: "Failed to initialize job stages" });
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
      // Bulk fetch all data in parallel (including custom fields for staff assignment)
      const [sm8Jobs, contactMap, companyMap, customFieldMap, notesMap] = await Promise.all([
        sm8Client.fetchJobs(),
        sm8Client.fetchAllJobContacts(),
        sm8Client.fetchAllCompanies(),
        sm8Client.fetchAllJobCustomFields(),
        sm8Client.fetchAllJobNotes()
      ]);
      
      for (const sm8Job of sm8Jobs) {
        // Get customer name: prioritize company name, then job contact
        let customerName = "Unknown Customer";
        
        // First try company name (this is the main customer record in ServiceM8)
        if (sm8Job.company_uuid) {
          const companyName = companyMap.get(sm8Job.company_uuid);
          if (companyName) {
            customerName = companyName;
          }
        }
        
        // Fall back to job contact name if no company
        if (customerName === "Unknown Customer") {
          const contact = contactMap.get(sm8Job.uuid);
          if (contact && (contact.first || contact.last)) {
            customerName = `${contact.first} ${contact.last}`.trim();
          }
        }
        
        const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job, customerName, customFieldMap);
        
        // Add communication history from notes
        const lastComm = notesMap.get(sm8Job.uuid);
        if (lastComm) {
          (mappedJob as any).lastCommunicationDate = lastComm.date;
          (mappedJob as any).lastCommunicationType = lastComm.type;
          const daysSince = Math.floor((Date.now() - lastComm.date.getTime()) / (1000 * 60 * 60 * 24));
          mappedJob.daysSinceLastContact = daysSince;
        }
        
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
