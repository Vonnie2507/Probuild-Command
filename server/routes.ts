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
  scopes: "read_jobs read_schedule manage_schedule read_job_notes read_staff read_customers publish_sms publish_email",
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
      
      // If workTypeId was set, initialize stages for this job
      if (partialJob.workTypeId) {
        await storage.initializeJobStages(jobId, partialJob.workTypeId);
      }
      
      res.json(updatedJob);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // Get job communication history from ServiceM8 (uses OAuth or API key)
  app.get("/api/jobs/:uuid/communications", async (req, res) => {
    try {
      const jobUuid = req.params.uuid;

      // Try OAuth first, then fall back to API key
      const token = await getValidOAuthToken();
      const apiKey = process.env.SERVICEM8_API_KEY;

      if (!token && !apiKey) {
        return res.status(401).json({
          error: "ServiceM8 not connected. Please connect via Settings or set SERVICEM8_API_KEY."
        });
      }

      const headers = token
        ? { "Authorization": `Bearer ${token.accessToken}`, "Accept": "application/json" }
        : { "X-API-Key": apiKey!, "Accept": "application/json" };

      const baseUrl = "https://api.servicem8.com/api_1.0";

      // Fetch from multiple endpoints in parallel to get all communications
      const [feedRes, notesRes, activityRes] = await Promise.all([
        fetch(`${baseUrl}/feeditem.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=100`, { headers }),
        fetch(`${baseUrl}/note.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=100`, { headers }),
        fetch(`${baseUrl}/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=100`, { headers })
      ]);

      const communications: Array<{
        timestamp: string;
        type: "internal_note" | "sms" | "email" | "call" | "system" | "update" | "note";
        author: string;
        message: string;
        direction?: "inbound" | "outbound" | "unknown";
      }> = [];

      // Process feed items (SMS, emails, system messages)
      if (feedRes.ok) {
        const feedItems = await feedRes.json();
        console.log(`[Comms] Fetched ${feedItems.length} feed items for job ${jobUuid}`);

        for (const item of feedItems) {
          const itemType = (item.type || '').toLowerCase();
          const message = item.message || item.description || '';
          let type: typeof communications[0]['type'] = 'system';
          let direction: "inbound" | "outbound" | "unknown" = 'unknown';

          // Determine type and direction
          if (itemType.includes('sms')) {
            type = 'sms';
            direction = itemType.includes('received') || itemType.includes('inbound') ? 'inbound' : 'outbound';
          } else if (itemType.includes('email')) {
            type = 'email';
            direction = itemType.includes('received') || itemType.includes('inbound') ? 'inbound' : 'outbound';
          } else if (itemType.includes('call') || itemType.includes('phone')) {
            type = 'call';
          } else if (itemType.includes('note')) {
            type = 'internal_note';
          } else if (itemType.includes('quote')) {
            type = 'email';
            direction = 'outbound';
          }

          if (message) {
            communications.push({
              timestamp: item.timestamp || item.created_date || '',
              type,
              author: item.staff_name || item.author || 'System',
              message,
              direction
            });
          }
        }
      }

      // Process notes
      if (notesRes.ok) {
        const notes = await notesRes.json();
        console.log(`[Comms] Fetched ${notes.length} notes for job ${jobUuid}`);

        for (const note of notes) {
          const noteText = (note.note || '').toLowerCase();
          let type: typeof communications[0]['type'] = 'note';
          let direction: "inbound" | "outbound" | "unknown" = 'unknown';

          // Try to detect if note mentions email/sms
          if (noteText.includes('email')) {
            type = 'email';
            if (noteText.includes('received') || noteText.includes('from customer') || noteText.includes('incoming')) {
              direction = 'inbound';
            } else if (noteText.includes('sent') || noteText.includes('to customer')) {
              direction = 'outbound';
            }
          } else if (noteText.includes('sms') || noteText.includes('text message')) {
            type = 'sms';
            if (noteText.includes('received') || noteText.includes('from customer') || noteText.includes('incoming')) {
              direction = 'inbound';
            } else if (noteText.includes('sent') || noteText.includes('to customer')) {
              direction = 'outbound';
            }
          } else if (noteText.includes('call') || noteText.includes('phone') || noteText.includes('spoke')) {
            type = 'call';
          }

          communications.push({
            timestamp: note.timestamp || note.create_date || '',
            type,
            author: note.created_by_staff_name || 'Staff',
            message: note.note || '',
            direction
          });
        }
      }

      // Process job activities
      if (activityRes.ok) {
        const activities = await activityRes.json();
        console.log(`[Comms] Fetched ${activities.length} activities for job ${jobUuid}`);

        for (const activity of activities) {
          const activityType = (activity.activity_type || '').toLowerCase();
          let type: typeof communications[0]['type'] = 'system';

          if (activityType.includes('sms')) {
            type = 'sms';
          } else if (activityType.includes('email')) {
            type = 'email';
          } else if (activityType.includes('call')) {
            type = 'call';
          } else if (activityType.includes('note')) {
            type = 'internal_note';
          }

          if (activity.description) {
            communications.push({
              timestamp: activity.timestamp || activity.start_date || '',
              type,
              author: activity.staff_name || 'Staff',
              message: activity.description || `Activity: ${activity.activity_type}`
            });
          }
        }
      }

      // Remove duplicates (by timestamp + message start) and sort
      const seen = new Set<string>();
      const uniqueComms = communications.filter(c => {
        const key = `${c.timestamp}-${c.message.substring(0, 30)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by timestamp descending
      uniqueComms.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime() || 0;
        const dateB = new Date(b.timestamp).getTime() || 0;
        return dateB - dateA;
      });

      console.log(`[Comms] Returning ${uniqueComms.length} communications for job ${jobUuid}`);
      res.json(uniqueComms);
    } catch (error) {
      console.error("Error fetching job communications:", error);
      res.status(500).json({ error: "Failed to fetch job communication history" });
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

  // Get all app settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Save all app settings
  app.post("/api/settings", async (req, res) => {
    try {
      await storage.saveAllAppSettings(req.body);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Get a specific setting
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const value = await storage.getAppSetting(req.params.key);
      res.json({ key: req.params.key, value });
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Set a specific setting
  app.put("/api/settings/:key", async (req, res) => {
    try {
      await storage.setAppSetting(req.params.key, req.body.value);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving setting:", error);
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  // Export all data for migration to production
  app.get("/api/export", async (req, res) => {
    try {
      const [settings, workTypes, allStages] = await Promise.all([
        storage.getAllAppSettings(),
        storage.getAllWorkTypes(),
        Promise.all((await storage.getAllWorkTypes()).map(wt => 
          storage.getStagesForWorkType(wt.id).then(stages => ({ workTypeId: wt.id, stages }))
        ))
      ]);
      
      // Build stages map
      const stagesMap: Record<number, any[]> = {};
      for (const item of allStages) {
        stagesMap[item.workTypeId] = item.stages;
      }
      
      res.json({
        exportedAt: new Date().toISOString(),
        settings,
        workTypes,
        workTypeStages: stagesMap
      });
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Import data from export (for production setup)
  app.post("/api/import", async (req, res) => {
    try {
      const { settings, workTypes, workTypeStages } = req.body;
      
      // Import settings
      if (settings) {
        await storage.saveAllAppSettings(settings);
      }
      
      // Import work types and their stages
      if (workTypes && Array.isArray(workTypes)) {
        for (const wt of workTypes) {
          // Create work type (skip id to let DB assign new one)
          const newWt = await storage.createWorkType({
            name: wt.name,
            description: wt.description,
            color: wt.color,
            isActive: wt.isActive
          });
          
          // Import stages for this work type
          const stages = workTypeStages?.[wt.id] || [];
          for (const stage of stages) {
            await storage.createWorkTypeStage({
              workTypeId: newWt.id,
              name: stage.name,
              key: stage.key,
              orderIndex: stage.orderIndex,
              description: stage.description,
              category: stage.category,
              triggersPurchaseOrder: stage.triggersPurchaseOrder,
              requiredMaterials: stage.requiredMaterials
            });
          }
        }
      }
      
      res.json({ success: true, message: "Data imported successfully" });
    } catch (error) {
      console.error("Error importing data:", error);
      res.status(500).json({ error: "Failed to import data" });
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
        // Bulk fetch all data in parallel for speed (including custom fields for staff assignment and badge definitions)
        const [sm8Jobs, contactMap, companyMap, customFieldMap, notesMap, clientContactMap, badgeDefinitions] = await Promise.all([
          sm8Client.fetchJobs(),
          sm8Client.fetchAllJobContacts(),
          sm8Client.fetchAllCompanies(),
          sm8Client.fetchAllJobCustomFields(),
          sm8Client.fetchAllJobNotes(),
          sm8Client.fetchLastClientContact(), // NEW: fetch when CLIENT last contacted us
          sm8Client.fetchBadges()
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

          const mappedJob = sm8Client.mapServiceM8JobToInsertJob(sm8Job, customerName, customFieldMap, badgeDefinitions);

          // Add communication history (any direction - inbound or outbound)
          const lastComm = notesMap.get(sm8Job.uuid);
          if (lastComm) {
            (mappedJob as any).lastCommunicationDate = lastComm.date;
            (mappedJob as any).lastCommunicationType = lastComm.type;
            (mappedJob as any).lastCommunicationDirection = lastComm.direction;
            const daysSince = Math.floor((Date.now() - lastComm.date.getTime()) / (1000 * 60 * 60 * 24));
            mappedJob.daysSinceLastContact = daysSince;
          } else {
            (mappedJob as any).lastCommunicationDate = null;
            (mappedJob as any).lastCommunicationType = null;
            (mappedJob as any).lastCommunicationDirection = null;
            mappedJob.daysSinceLastContact = null;
          }

          // NEW: Add CLIENT contact tracking (inbound only - when client contacted US)
          const lastClientContact = clientContactMap.get(sm8Job.uuid);
          if (lastClientContact) {
            (mappedJob as any).lastClientContactDate = lastClientContact.date;
            (mappedJob as any).lastClientContactType = lastClientContact.type;
            const daysSinceClient = Math.floor((Date.now() - lastClientContact.date.getTime()) / (1000 * 60 * 60 * 24));
            (mappedJob as any).daysSinceClientContact = daysSinceClient;
          } else {
            (mappedJob as any).lastClientContactDate = null;
            (mappedJob as any).lastClientContactType = null;
            (mappedJob as any).daysSinceClientContact = null;
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

  // Send SMS via ServiceM8 messaging API
  app.post("/api/messaging/sms", async (req, res) => {
    try {
      const { to, message, jobUuid, staffUuid } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({ error: "Missing required fields: to, message" });
      }

      // Validate phone number format (should be E.164 with + prefix)
      let phoneNumber = to.trim();
      if (!phoneNumber.startsWith('+')) {
        // Assume Australian number if no country code
        phoneNumber = phoneNumber.replace(/^0/, '+61');
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = '+61' + phoneNumber;
        }
      }

      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ 
          error: "ServiceM8 not connected",
          message: "Please connect to ServiceM8 in Settings first"
        });
      }

      // Build headers with optional staff impersonation
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      
      if (staffUuid) {
        headers["x-impersonate-uuid"] = staffUuid;
      }

      // Build payload for ServiceM8 platform SMS API
      const payload: Record<string, string> = {
        to: phoneNumber,
        message: message,
      };
      
      // Link to job if UUID provided
      if (jobUuid) {
        payload.regardingJobUUID = jobUuid;
      }

      // Send SMS via ServiceM8 platform SMS API
      const smsResponse = await fetch("https://api.servicem8.com/platform_service_sms", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const result = await smsResponse.json().catch(() => ({}));
      
      if (!smsResponse.ok) {
        console.error("ServiceM8 SMS send failed:", smsResponse.status, result);
        // Return sanitized error to client
        const errorMessage = result.message || "Failed to send SMS. Please check the phone number and try again.";
        return res.status(smsResponse.status).json({ 
          error: "Failed to send SMS",
          message: errorMessage,
          errorCode: result.errorCode
        });
      }

      console.log("SMS sent successfully:", result);

      res.json({
        success: true,
        message: result.message || "SMS sent successfully",
        messageId: result.messageID,
        to: result.to
      });
    } catch (error: any) {
      console.error("Error sending SMS:", error);
      res.status(500).json({ error: "Failed to send SMS", message: "An unexpected error occurred. Please try again." });
    }
  });

  // Send Email via ServiceM8 messaging API
  app.post("/api/messaging/email", async (req, res) => {
    try {
      const { to, subject, body, jobUuid, staffUuid } = req.body;

      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Missing required fields: to, subject, body" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        return res.status(400).json({ error: "Invalid email address format" });
      }

      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({
          error: "ServiceM8 not connected",
          message: "Please connect to ServiceM8 in Settings first"
        });
      }

      // Build headers with optional staff impersonation
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      if (staffUuid) {
        headers["x-impersonate-uuid"] = staffUuid;
      }

      // Build payload for ServiceM8 platform email API
      const payload: Record<string, string> = {
        to: to,
        subject: subject,
        body: body,
      };

      // Link to job if UUID provided
      if (jobUuid) {
        payload.regardingJobUUID = jobUuid;
      }

      // Send email via ServiceM8 platform email API
      const emailResponse = await fetch("https://api.servicem8.com/platform_service_email", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const result = await emailResponse.json().catch(() => ({}));

      if (!emailResponse.ok) {
        console.error("ServiceM8 email send failed:", emailResponse.status, result);
        const errorMessage = result.message || "Failed to send email. Please check the email address and try again.";
        return res.status(emailResponse.status).json({
          error: "Failed to send email",
          message: errorMessage,
          errorCode: result.errorCode
        });
      }

      console.log("Email sent successfully:", result);

      res.json({
        success: true,
        message: result.message || "Email sent successfully",
        messageId: result.messageID,
        to: result.to
      });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email", message: "An unexpected error occurred. Please try again." });
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

  // Get enriched job cards with company info and contacts from ServiceM8
  app.get("/api/jobCards", async (req, res) => {
    try {
      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ 
          error: "ServiceM8 not connected",
          message: "Please connect to ServiceM8 in Settings first"
        });
      }

      const baseUrl = "https://api.servicem8.com/api_1.0";
      const headers = {
        "Authorization": `Bearer ${token.accessToken}`,
        "Accept": "application/json",
      };

      // Fetch all jobs, companies, and company contacts in parallel
      const [jobsResponse, companiesResponse, contactsResponse] = await Promise.all([
        fetch(`${baseUrl}/job.json?%24filter=active%20eq%201&%24top=1000`, { headers }),
        fetch(`${baseUrl}/company.json?%24top=5000`, { headers }),
        fetch(`${baseUrl}/companycontact.json?%24top=5000`, { headers }),
      ]);

      if (!jobsResponse.ok) {
        console.error("Failed to fetch jobs:", jobsResponse.status);
        return res.status(jobsResponse.status).json({ error: "Failed to fetch jobs from ServiceM8" });
      }

      const jobs = await jobsResponse.json();
      const companies = companiesResponse.ok ? await companiesResponse.json() : [];
      const contacts = contactsResponse.ok ? await contactsResponse.json() : [];

      // Build company map
      const companyMap = new Map<string, {
        uuid: string;
        name: string;
        email: string;
        phone: string;
        mobile: string;
      }>();
      for (const c of companies) {
        if (c.uuid) {
          companyMap.set(c.uuid, {
            uuid: c.uuid,
            name: c.name || c.company_name || "Unknown",
            email: c.email || "",
            phone: c.phone || "",
            mobile: c.mobile || "",
          });
        }
      }

      // Build contacts map grouped by company_uuid
      const contactsMap = new Map<string, Array<{
        uuid: string;
        name: string;
        email: string;
        mobile: string;
        phone: string;
        isPrimary: boolean;
      }>>();
      for (const c of contacts) {
        if (c.company_uuid) {
          const contact = {
            uuid: c.uuid || "",
            name: [c.first, c.last].filter(Boolean).join(" ") || "Unknown",
            email: c.email || "",
            mobile: c.mobile || "",
            phone: c.phone || "",
            isPrimary: c.is_primary === 1 || c.is_primary === true,
          };
          const existing = contactsMap.get(c.company_uuid) || [];
          existing.push(contact);
          contactsMap.set(c.company_uuid, existing);
        }
      }

      // Enrich each job with company info
      const jobCards = jobs.map((job: any) => {
        const companyUuid = job.company_uuid;
        const company = companyUuid ? companyMap.get(companyUuid) : null;
        const companyContacts = companyUuid ? contactsMap.get(companyUuid) || [] : [];

        return {
          // Core job data
          uuid: job.uuid,
          jobId: job.generated_job_id ? `#${job.generated_job_id}` : "#N/A",
          status: job.status,
          address: job.job_address || job.billing_address || "No Address",
          description: job.job_description || "",
          quoteValue: parseFloat(job.total_invoice_amount) || 0,
          quoteSent: job.quote_sent === true,
          quoteSentDate: job.quote_sent_stamp || null,
          quoteDate: job.quote_date || null,
          createdAt: job.date || null,
          
          // Company info
          companyUuid: companyUuid || null,
          companyName: company?.name || "Unknown Customer",
          companyEmail: company?.email || "",
          companyPhone: company?.phone || "",
          companyMobile: company?.mobile || "",
          
          // Company contacts array
          contacts: companyContacts,
        };
      });

      res.json({ jobCards });
    } catch (error: any) {
      console.error("Error fetching job cards:", error);
      res.status(500).json({ error: "Failed to fetch job cards", message: error.message });
    }
  });

  // Get company info for a specific job
  app.get("/api/servicem8/job-company/:jobUuid", async (req, res) => {
    try {
      const { jobUuid } = req.params;
      
      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ error: "ServiceM8 not connected" });
      }

      const baseUrl = "https://api.servicem8.com/api_1.0";
      const headers = {
        "Authorization": `Bearer ${token.accessToken}`,
        "Accept": "application/json",
      };

      // First get the job to find company_uuid
      const jobResponse = await fetch(`${baseUrl}/job/${jobUuid}.json`, { headers });
      if (!jobResponse.ok) {
        return res.status(404).json({ error: "Job not found" });
      }
      const job = await jobResponse.json();
      const companyUuid = job.company_uuid;

      if (!companyUuid) {
        return res.json({
          companyName: "Unknown Customer",
          companyEmail: "",
          companyPhone: "",
          companyMobile: "",
          contacts: [],
        });
      }

      // Fetch company and contacts in parallel
      const [companyResponse, contactsResponse] = await Promise.all([
        fetch(`${baseUrl}/company/${companyUuid}.json`, { headers }),
        fetch(`${baseUrl}/companycontact.json?%24filter=company_uuid%20eq%20'${companyUuid}'`, { headers }),
      ]);

      const company = companyResponse.ok ? await companyResponse.json() : null;
      const contacts = contactsResponse.ok ? await contactsResponse.json() : [];

      res.json({
        companyName: company?.name || company?.company_name || "Unknown Customer",
        companyEmail: company?.email || "",
        companyPhone: company?.phone || "",
        companyMobile: company?.mobile || "",
        contacts: contacts.map((c: any) => ({
          uuid: c.uuid || "",
          name: [c.first, c.last].filter(Boolean).join(" ") || "Unknown",
          email: c.email || "",
          mobile: c.mobile || "",
          phone: c.phone || "",
          isPrimary: c.is_primary === 1 || c.is_primary === true,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching job company:", error);
      res.status(500).json({ error: "Failed to fetch company info" });
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

  // ============== COMPREHENSIVE COMMUNICATION DEBUG ENDPOINT ==============
  // This endpoint shows ALL raw communication data from ServiceM8 for a job
  app.get("/api/debug/job-communications/:jobUuid", async (req, res) => {
    const { jobUuid } = req.params;
    const debugData: Record<string, any> = {
      jobUuid,
      timestamp: new Date().toISOString(),
      endpoints: {}
    };

    try {
      const token = await getValidOAuthToken();
      const apiKey = process.env.SERVICEM8_API_KEY;

      if (!token && !apiKey) {
        return res.status(401).json({
          error: "No ServiceM8 credentials available",
          hasOAuth: false,
          hasApiKey: false
        });
      }

      const headers = token
        ? { "Authorization": `Bearer ${token.accessToken}`, "Content-Type": "application/json" }
        : { "X-API-Key": apiKey!, "Content-Type": "application/json" };

      debugData.authMethod = token ? "OAuth" : "API Key";

      // 1. Fetch feeditems (activity feed - emails, SMS, etc)
      try {
        const feedRes = await fetch(
          `https://api.servicem8.com/api_1.0/feeditem.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=50`,
          { headers }
        );
        if (feedRes.ok) {
          const feedItems = await feedRes.json();
          debugData.endpoints.feeditem = {
            status: feedRes.status,
            count: feedItems.length,
            items: feedItems.map((item: any) => ({
              uuid: item.uuid,
              type: item.type,
              timestamp: item.timestamp,
              message: item.message?.substring(0, 200),
              description: item.description?.substring(0, 200),
              staff_name: item.staff_name,
              related_object: item.related_object,
              all_fields: Object.keys(item)
            }))
          };
        } else {
          debugData.endpoints.feeditem = { status: feedRes.status, error: await feedRes.text() };
        }
      } catch (e: any) {
        debugData.endpoints.feeditem = { error: e.message };
      }

      // 2. Fetch jobactivity
      try {
        const activityRes = await fetch(
          `https://api.servicem8.com/api_1.0/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=50`,
          { headers }
        );
        if (activityRes.ok) {
          const activities = await activityRes.json();
          debugData.endpoints.jobactivity = {
            status: activityRes.status,
            count: activities.length,
            items: activities.map((item: any) => ({
              uuid: item.uuid,
              activity_type: item.activity_type,
              timestamp: item.timestamp,
              description: item.description?.substring(0, 200),
              staff_name: item.staff_name,
              all_fields: Object.keys(item)
            }))
          };
        } else {
          debugData.endpoints.jobactivity = { status: activityRes.status, error: await activityRes.text() };
        }
      } catch (e: any) {
        debugData.endpoints.jobactivity = { error: e.message };
      }

      // 3. Fetch notes
      try {
        const notesRes = await fetch(
          `https://api.servicem8.com/api_1.0/note.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=50`,
          { headers }
        );
        if (notesRes.ok) {
          const notes = await notesRes.json();
          debugData.endpoints.notes = {
            status: notesRes.status,
            count: notes.length,
            items: notes.map((item: any) => ({
              uuid: item.uuid,
              note: item.note?.substring(0, 200),
              timestamp: item.timestamp,
              created_by_staff_name: item.created_by_staff_name,
              entry_method: item.entry_method,
              note_type: item.note_type,
              all_fields: Object.keys(item)
            }))
          };
        } else {
          debugData.endpoints.notes = { status: notesRes.status, error: await notesRes.text() };
        }
      } catch (e: any) {
        debugData.endpoints.notes = { error: e.message };
      }

      // 4. Try smslog endpoint (if it exists)
      try {
        const smsRes = await fetch(
          `https://api.servicem8.com/api_1.0/smslog.json?%24filter=job_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=50`,
          { headers }
        );
        if (smsRes.ok) {
          const smsLogs = await smsRes.json();
          debugData.endpoints.smslog = {
            status: smsRes.status,
            count: smsLogs.length,
            items: smsLogs
          };
        } else {
          debugData.endpoints.smslog = { status: smsRes.status, error: "Endpoint may not exist or no access" };
        }
      } catch (e: any) {
        debugData.endpoints.smslog = { error: e.message };
      }

      // 5. Try emaillog endpoint (if it exists)
      try {
        const emailRes = await fetch(
          `https://api.servicem8.com/api_1.0/emaillog.json?%24filter=job_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=50`,
          { headers }
        );
        if (emailRes.ok) {
          const emailLogs = await emailRes.json();
          debugData.endpoints.emaillog = {
            status: emailRes.status,
            count: emailLogs.length,
            items: emailLogs
          };
        } else {
          debugData.endpoints.emaillog = { status: emailRes.status, error: "Endpoint may not exist or no access" };
        }
      } catch (e: any) {
        debugData.endpoints.emaillog = { error: e.message };
      }

      // 6. Try queue endpoint for SMS queue
      try {
        const queueRes = await fetch(
          `https://api.servicem8.com/api_1.0/queue.json?%24top=10`,
          { headers }
        );
        if (queueRes.ok) {
          const queues = await queueRes.json();
          debugData.endpoints.queue = {
            status: queueRes.status,
            count: queues.length,
            note: "These are job queues, not message queues"
          };
        } else {
          debugData.endpoints.queue = { status: queueRes.status };
        }
      } catch (e: any) {
        debugData.endpoints.queue = { error: e.message };
      }

      res.json(debugData);
    } catch (error: any) {
      console.error("Debug communications error:", error);
      res.status(500).json({ error: error.message, debugData });
    }
  });

  // Debug endpoint to see ALL feeditems (to understand what types ServiceM8 uses)
  app.get("/api/debug/all-feeditems", async (req, res) => {
    try {
      const token = await getValidOAuthToken();
      const apiKey = process.env.SERVICEM8_API_KEY;

      if (!token && !apiKey) {
        return res.status(401).json({ error: "No ServiceM8 credentials" });
      }

      const headers = token
        ? { "Authorization": `Bearer ${token.accessToken}`, "Content-Type": "application/json" }
        : { "X-API-Key": apiKey!, "Content-Type": "application/json" };

      const feedRes = await fetch(
        `https://api.servicem8.com/api_1.0/feeditem.json?%24orderby=timestamp%20desc&%24top=100`,
        { headers }
      );

      if (!feedRes.ok) {
        return res.status(feedRes.status).json({ error: await feedRes.text() });
      }

      const feedItems = await feedRes.json();

      // Group by type to see what types exist
      const typeGroups: Record<string, any[]> = {};
      for (const item of feedItems) {
        const type = item.type || 'unknown';
        if (!typeGroups[type]) typeGroups[type] = [];
        typeGroups[type].push({
          uuid: item.uuid,
          timestamp: item.timestamp,
          message: item.message?.substring(0, 150),
          related_object: item.related_object,
          staff_name: item.staff_name
        });
      }

      res.json({
        totalItems: feedItems.length,
        uniqueTypes: Object.keys(typeGroups),
        byType: typeGroups,
        sampleRawItem: feedItems[0] // Show one complete raw item
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch Job Activity/Diary - try API key first, fallback to OAuth
  app.get("/api/servicem8/job-activity/:jobUuid", async (req, res) => {
    const { jobUuid } = req.params;
    const apiKey = process.env.SERVICEM8_API_KEY;
    
    try {
      // Try API key first (more reliable)
      if (apiKey) {
        const [activitiesRes, notesRes, feedRes] = await Promise.all([
          fetch(`https://api.servicem8.com/api_1.0/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'`, {
            headers: { "X-API-Key": apiKey, "Content-Type": "application/json" }
          }),
          fetch(`https://api.servicem8.com/api_1.0/note.json?%24filter=related_object%20eq%20'job'%20and%20related_object_uuid%20eq%20'${jobUuid}'`, {
            headers: { "X-API-Key": apiKey, "Content-Type": "application/json" }
          }),
          fetch(`https://api.servicem8.com/api_1.0/feeditem.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc&%24top=100`, {
            headers: { "X-API-Key": apiKey, "Content-Type": "application/json" }
          })
        ]);

        const activities = activitiesRes.ok ? await activitiesRes.json() : [];
        const notes = notesRes.ok ? await notesRes.json() : [];
        const feedItems = feedRes.ok ? await feedRes.json() : [];

        // Combine and format all activity types
        const allActivity = [
          ...activities.map((a: any) => ({
            type: a.activity_type || 'activity',
            timestamp: a.timestamp,
            description: a.description || a.activity_type,
            staff: a.staff_name || a.staff_uuid,
            details: a
          })),
          ...notes.map((n: any) => ({
            type: 'note',
            timestamp: n.timestamp,
            description: n.note,
            staff: n.staff_name || n.staff_uuid,
            details: n
          })),
          ...feedItems.map((f: any) => ({
            type: f.type || 'feed',
            timestamp: f.timestamp,
            description: f.message || f.description || f.type,
            staff: f.staff_name || f.created_by_staff_uuid,
            details: f
          }))
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return res.json(allActivity);
      }

      // Fallback to OAuth
      const token = await storage.getOAuthToken("servicem8");
      if (!token) {
        return res.status(401).json({ error: "ServiceM8 not configured. Please set API key or connect OAuth." });
      }

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

  // Fetch job contact info for SMS/email
  app.get("/api/servicem8/job-contact/:jobUuid", async (req, res) => {
    try {
      const token = await getValidOAuthToken();
      if (!token) {
        return res.status(401).json({ error: "Not connected to ServiceM8 OAuth. Please connect first." });
      }

      const { jobUuid } = req.params;
      
      // Fetch job contacts
      const contactRes = await fetch(
        `https://api.servicem8.com/api_1.0/jobcontact.json?%24filter=job_uuid%20eq%20'${jobUuid}'`,
        {
          headers: {
            "Authorization": `Bearer ${token.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!contactRes.ok) {
        return res.status(contactRes.status).json({ error: "Failed to fetch contact" });
      }

      const contacts = await contactRes.json();
      
      if (contacts.length === 0) {
        return res.json({ phone: "", mobile: "", email: "" });
      }

      const contact = contacts[0];
      res.json({
        first: contact.first || "",
        last: contact.last || "",
        phone: contact.phone || "",
        mobile: contact.mobile || "",
        email: contact.email || ""
      });
    } catch (error: any) {
      console.error("Error fetching job contact:", error);
      res.status(500).json({ error: "Failed to fetch job contact", message: error.message });
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

  // Start timer for a task/stage
  app.post("/api/jobs/:jobId/stages/:stageId/timer/start", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      
      // Ensure stage progress record exists
      await storage.getOrCreateStageProgress(jobId, stageId);
      
      const result = await storage.startTimer(jobId, stageId);
      if (!result) {
        return res.status(404).json({ error: "Stage progress not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error starting timer:", error);
      res.status(500).json({ error: "Failed to start timer" });
    }
  });

  // Stop timer for a task/stage
  app.post("/api/jobs/:jobId/stages/:stageId/timer/stop", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      const result = await storage.stopTimer(jobId, stageId);
      if (!result) {
        return res.status(404).json({ error: "Stage progress not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error stopping timer:", error);
      res.status(500).json({ error: "Failed to stop timer" });
    }
  });

  // Get timer status for all stages of a job
  app.get("/api/jobs/:jobId/timers", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const progress = await storage.getJobStageProgress(jobId);
      
      // Calculate current elapsed time for running timers
      const timers = progress.map(p => {
        let currentElapsed = p.totalTimeSeconds || 0;
        if (p.timerRunning && p.timerStartedAt) {
          const now = new Date();
          currentElapsed += Math.floor((now.getTime() - p.timerStartedAt.getTime()) / 1000);
        }
        return {
          stageId: p.stageId,
          timerRunning: p.timerRunning,
          timerStartedAt: p.timerStartedAt,
          totalTimeSeconds: p.totalTimeSeconds,
          currentElapsedSeconds: currentElapsed,
          status: p.status
        };
      });
      
      res.json(timers);
    } catch (error) {
      console.error("Error fetching timers:", error);
      res.status(500).json({ error: "Failed to fetch timers" });
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
      const [sm8Jobs, contactMap, companyMap, customFieldMap, notesMap, clientContactMap] = await Promise.all([
        sm8Client.fetchJobs(),
        sm8Client.fetchAllJobContacts(),
        sm8Client.fetchAllCompanies(),
        sm8Client.fetchAllJobCustomFields(),
        sm8Client.fetchAllJobNotes(),
        sm8Client.fetchLastClientContact() // NEW: fetch when CLIENT last contacted us
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

        // Add communication history (any direction - inbound or outbound)
        const lastComm = notesMap.get(sm8Job.uuid);
        if (lastComm) {
          (mappedJob as any).lastCommunicationDate = lastComm.date;
          (mappedJob as any).lastCommunicationType = lastComm.type;
          (mappedJob as any).lastCommunicationDirection = lastComm.direction;
          const daysSince = Math.floor((Date.now() - lastComm.date.getTime()) / (1000 * 60 * 60 * 24));
          mappedJob.daysSinceLastContact = daysSince;
        } else {
          (mappedJob as any).lastCommunicationDate = null;
          (mappedJob as any).lastCommunicationType = null;
          (mappedJob as any).lastCommunicationDirection = null;
          mappedJob.daysSinceLastContact = null;
        }

        // NEW: Add CLIENT contact tracking (inbound only - when client contacted US)
        const lastClientContact = clientContactMap.get(sm8Job.uuid);
        if (lastClientContact) {
          (mappedJob as any).lastClientContactDate = lastClientContact.date;
          (mappedJob as any).lastClientContactType = lastClientContact.type;
          const daysSinceClient = Math.floor((Date.now() - lastClientContact.date.getTime()) / (1000 * 60 * 60 * 24));
          (mappedJob as any).daysSinceClientContact = daysSinceClient;
        } else {
          (mappedJob as any).lastClientContactDate = null;
          (mappedJob as any).lastClientContactType = null;
          (mappedJob as any).daysSinceClientContact = null;
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
