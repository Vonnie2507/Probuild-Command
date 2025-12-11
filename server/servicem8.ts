import { type InsertJob, type LifecyclePhase, type SchedulerStage } from "@shared/schema";

interface ServiceM8Job {
  uuid: string;
  generated_job_id: string;
  job_address: string;
  billing_address: string;
  job_description: string;
  work_done_description: string;
  status: string;
  total_invoice_amount: string;
  active: number;
  company_uuid: string;
  queue_uuid: string;
  quote_date: string;
  quote_sent: boolean;
  quote_sent_stamp: string;
  badges: string;
  [key: string]: any;
}

// ServiceM8 status values that indicate Quote phase
const QUOTE_STATUSES = ['Quote', 'Lead', 'Estimate', 'Pending', 'Draft'];
// ServiceM8 status values that indicate Work Order phase  
const WORK_ORDER_STATUSES = ['Work Order', 'In Progress', 'Scheduled', 'Completed', 'Job Complete'];

export class ServiceM8Client {
  private baseUrl = "https://api.servicem8.com/api_1.0";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchJobs(limit: number = 1000): Promise<ServiceM8Job[]> {
    const response = await fetch(`${this.baseUrl}/job.json?%24filter=active%20eq%201&%24top=${limit}`, {
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`ServiceM8 API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async fetchCompany(companyUuid: string): Promise<{ name: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/company/${companyUuid}.json`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return { name: data.name || data.company_name || "Unknown" };
    } catch {
      return null;
    }
  }

  // Fetch full company record with all contact details
  async fetchCompanyFull(companyUuid: string): Promise<{
    uuid: string;
    name: string;
    email: string;
    phone: string;
    mobile: string;
  } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/company/${companyUuid}.json`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return {
        uuid: data.uuid || companyUuid,
        name: data.name || data.company_name || "Unknown",
        email: data.email || "",
        phone: data.phone || "",
        mobile: data.mobile || "",
      };
    } catch {
      return null;
    }
  }

  // Fetch all company contacts for a given company
  async fetchCompanyContacts(companyUuid: string): Promise<Array<{
    uuid: string;
    name: string;
    email: string;
    mobile: string;
    phone: string;
    isPrimary: boolean;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/companycontact.json?%24filter=company_uuid%20eq%20'${companyUuid}'`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return [];
      const contacts = await response.json();
      return contacts.map((c: any) => ({
        uuid: c.uuid || "",
        name: [c.first, c.last].filter(Boolean).join(" ") || "Unknown",
        email: c.email || "",
        mobile: c.mobile || "",
        phone: c.phone || "",
        isPrimary: c.is_primary === 1 || c.is_primary === true,
      }));
    } catch {
      return [];
    }
  }

  // Fetch all badge definitions
  async fetchBadges(): Promise<Map<string, string>> {
    const badgeMap = new Map<string, string>();
    try {
      const response = await fetch(`${this.baseUrl}/badge.json`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        console.error("[Badges] Failed to fetch badges:", response.status);
        return badgeMap;
      }
      const badges = await response.json();
      console.log(`[Badges] Fetched ${badges.length} badge definitions`);
      for (const badge of badges) {
        if (badge.uuid && badge.name) {
          badgeMap.set(badge.uuid, badge.name);
          console.log(`[Badges] Badge: ${badge.uuid} = "${badge.name}"`);
        }
      }
    } catch (e) {
      console.error("[Badges] Error fetching badges:", e);
    }
    return badgeMap;
  }

  // Bulk fetch all companies with full details
  async fetchAllCompaniesFull(): Promise<Map<string, {
    uuid: string;
    name: string;
    email: string;
    phone: string;
    mobile: string;
  }>> {
    const companyMap = new Map();
    try {
      const response = await fetch(`${this.baseUrl}/company.json?%24top=5000`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return companyMap;
      const companies = await response.json();
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
    } catch (e) {
      console.error("Error fetching all companies full:", e);
    }
    return companyMap;
  }

  // Bulk fetch all company contacts
  async fetchAllCompanyContacts(): Promise<Map<string, Array<{
    uuid: string;
    name: string;
    email: string;
    mobile: string;
    phone: string;
    isPrimary: boolean;
  }>>> {
    const contactMap = new Map();
    try {
      const response = await fetch(`${this.baseUrl}/companycontact.json?%24top=5000`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return contactMap;
      const contacts = await response.json();
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
          const existing = contactMap.get(c.company_uuid) || [];
          existing.push(contact);
          contactMap.set(c.company_uuid, existing);
        }
      }
    } catch (e) {
      console.error("Error fetching all company contacts:", e);
    }
    return contactMap;
  }

  async fetchJobContact(jobUuid: string): Promise<{ first: string; last: string; phone?: string; mobile?: string; email?: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/jobcontact.json?%24filter=job_uuid%20eq%20'${jobUuid}'`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return null;
      const contacts = await response.json();
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        return {
          first: contact.first || "",
          last: contact.last || "",
          phone: contact.phone,
          mobile: contact.mobile,
          email: contact.email
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Bulk fetch all job contacts in one API call
  async fetchAllJobContacts(): Promise<Map<string, { first: string; last: string }>> {
    const contactMap = new Map<string, { first: string; last: string }>();
    try {
      const response = await fetch(`${this.baseUrl}/jobcontact.json?%24top=5000`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return contactMap;
      const contacts = await response.json();
      for (const contact of contacts) {
        if (contact.job_uuid && (contact.first || contact.last)) {
          contactMap.set(contact.job_uuid, {
            first: contact.first || "",
            last: contact.last || ""
          });
        }
      }
    } catch (e) {
      console.error("Error fetching all job contacts:", e);
    }
    return contactMap;
  }

  // Fetch last sent email/SMS for each job from activity feed
  async fetchAllJobNotes(): Promise<Map<string, { date: Date; type: string; note: string }>> {
    const commMap = new Map<string, { date: Date; type: string; note: string }>();
    try {
      // Fetch activity/feed for sent messages - ServiceM8 uses feeditem for activity
      const response = await fetch(`${this.baseUrl}/feeditem.json?%24top=5000&%24orderby=timestamp%20desc`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        console.log("[Comms] Failed to fetch feed items:", response.status);
        // Fall back to notes API
        return this.fetchJobNotesFromNotes();
      }
      const feedItems = await response.json();
      console.log(`[Comms] Fetched ${feedItems.length} feed items from ServiceM8`);
      
      // Log sample to understand structure
      if (feedItems.length > 0) {
        console.log(`[Comms] Sample feed item:`, JSON.stringify(feedItems[0], null, 2).substring(0, 500));
      }
      
      // Find INCOMING SMS and Email from customers (not outgoing from staff)
      for (const item of feedItems) {
        if (!item.related_object_uuid || item.related_object !== 'job') continue;
        
        const jobUuid = item.related_object_uuid;
        const itemType = (item.type || '').toLowerCase();
        const message = (item.message || item.description || '').toLowerCase();
        const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
        
        // Only track INCOMING/RECEIVED emails and SMS from customers
        let commType: string | null = null;
        
        // Check for received/incoming indicators
        if (itemType === 'sms_received' || itemType === 'sms_inbound' || 
            itemType.includes('sms') && (itemType.includes('received') || itemType.includes('inbound'))) {
          commType = 'sms';
        } else if (itemType === 'email_received' || itemType === 'email_inbound' ||
            itemType.includes('email') && (itemType.includes('received') || itemType.includes('inbound'))) {
          commType = 'email';
        }
        // Also check message content for "received" or "from customer" patterns
        else if (message.includes('received') || message.includes('from customer') || message.includes('customer replied')) {
          if (message.includes('sms') || message.includes('text')) {
            commType = 'sms';
          } else if (message.includes('email')) {
            commType = 'email';
          }
        }
        
        // Skip if not an incoming email or SMS
        if (!commType) continue;
        
        // Only keep the most recent incoming message per job
        const existing = commMap.get(jobUuid);
        if (!existing || timestamp > existing.date) {
          commMap.set(jobUuid, {
            date: timestamp,
            type: commType,
            note: item.message || item.description || ''
          });
        }
      }
      
      console.log(`[Comms] Mapped last email/SMS for ${commMap.size} jobs`);
    } catch (e) {
      console.error("[Comms] Error fetching feed items:", e);
    }
    return commMap;
  }

  // Fallback: Parse notes to find email/SMS mentions
  private async fetchJobNotesFromNotes(): Promise<Map<string, { date: Date; type: string; note: string }>> {
    const commMap = new Map<string, { date: Date; type: string; note: string }>();
    try {
      const response = await fetch(`${this.baseUrl}/note.json?%24top=5000&%24orderby=timestamp%20desc`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return commMap;
      const notes = await response.json();
      
      for (const note of notes) {
        if (!note.related_object_uuid || note.related_object !== 'job') continue;
        
        const jobUuid = note.related_object_uuid;
        const noteText = (note.note || '').toLowerCase();
        const timestamp = note.timestamp ? new Date(note.timestamp) : new Date();
        
        // ONLY track INCOMING emails and SMS from customers - not outgoing
        let commType: string | null = null;
        if (noteText.includes('email received') || noteText.includes('received email') || 
            noteText.includes('customer email') || noteText.includes('email from')) {
          commType = 'email';
        } else if (noteText.includes('sms received') || noteText.includes('received sms') || 
            noteText.includes('customer sms') || noteText.includes('sms from') ||
            noteText.includes('text received') || noteText.includes('received text')) {
          commType = 'sms';
        }
        
        // Skip if not an incoming email or SMS
        if (!commType) continue;
        
        const existing = commMap.get(jobUuid);
        if (!existing || timestamp > existing.date) {
          commMap.set(jobUuid, {
            date: timestamp,
            type: commType,
            note: note.note || ''
          });
        }
      }
      
      console.log(`[Comms] Mapped last email/SMS from notes for ${commMap.size} jobs`);
    } catch (e) {
      console.error("[Comms] Error fetching notes:", e);
    }
    return commMap;
  }

  // Fetch job activity log (internal notes, updates, staff comments)
  async fetchJobActivity(jobUuid: string): Promise<Array<{
    timestamp: string;
    type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
    author: string;
    message: string;
  }>> {
    const activities: Array<{
      timestamp: string;
      type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
      author: string;
      message: string;
    }> = [];
    
    try {
      const response = await fetch(`${this.baseUrl}/jobactivity.json?%24filter=job_uuid%20eq%20'${jobUuid}'`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        console.log(`[Activity] Failed to fetch job activity: ${response.status}`);
        return activities;
      }
      
      const items = await response.json();
      console.log(`[Activity] Fetched ${items.length} activity items for job ${jobUuid}`);
      
      for (const item of items) {
        const activityType = (item.activity_type || item.type || '').toLowerCase();
        const timestamp = item.timestamp || item.created_date || item.edit_date || '';
        const author = item.staff_name || item.created_by_staff_name || item.author || 'System';
        const message = item.activity_text || item.comment || item.note || item.description || '';
        
        let type: "internal_note" | "sms" | "email" | "call" | "system" | "update" = 'system';
        
        if (activityType.includes('note') || activityType.includes('comment')) {
          type = 'internal_note';
        } else if (activityType.includes('sms') || activityType.includes('text')) {
          type = 'sms';
        } else if (activityType.includes('email')) {
          type = 'email';
        } else if (activityType.includes('call') || activityType.includes('phone')) {
          type = 'call';
        } else if (activityType.includes('update') || activityType.includes('change') || activityType.includes('status')) {
          type = 'update';
        }
        
        activities.push({ timestamp, type, author, message });
      }
    } catch (e) {
      console.error("[Activity] Error fetching job activity:", e);
    }
    
    return activities;
  }

  // Fetch client communications (emails, SMS, messages)
  async fetchJobCommunications(jobUuid: string): Promise<Array<{
    timestamp: string;
    type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
    author: string;
    message: string;
  }>> {
    const communications: Array<{
      timestamp: string;
      type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
      author: string;
      message: string;
    }> = [];
    
    try {
      // Try the clientcommunication endpoint
      const response = await fetch(`${this.baseUrl}/clientcommunication.json?%24filter=job_uuid%20eq%20'${jobUuid}'`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        console.log(`[Comms] clientcommunication endpoint returned ${response.status}, trying feeditem`);
        // Fallback to feeditem endpoint filtered by job
        return this.fetchJobCommunicationsFromFeed(jobUuid);
      }
      
      const items = await response.json();
      console.log(`[Comms] Fetched ${items.length} communication items for job ${jobUuid}`);
      
      for (const item of items) {
        const commType = (item.communication_type || item.type || '').toLowerCase();
        const timestamp = item.timestamp || item.sent_date || item.created_date || '';
        const direction = (item.direction || '').toLowerCase();
        const authorName = direction === 'inbound' || direction === 'received' 
          ? (item.from_name || item.customer_name || 'Customer')
          : (item.staff_name || item.from_name || 'Staff');
        const message = item.message || item.body || item.subject || item.content || '';
        
        let type: "internal_note" | "sms" | "email" | "call" | "system" | "update" = 'email';
        
        if (commType.includes('sms') || commType.includes('text')) {
          type = 'sms';
        } else if (commType.includes('email')) {
          type = 'email';
        } else if (commType.includes('call') || commType.includes('phone')) {
          type = 'call';
        }
        
        communications.push({ timestamp, type, author: authorName, message });
      }
    } catch (e) {
      console.error("[Comms] Error fetching client communications:", e);
    }
    
    return communications;
  }

  // Fallback: fetch communications from feed items
  private async fetchJobCommunicationsFromFeed(jobUuid: string): Promise<Array<{
    timestamp: string;
    type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
    author: string;
    message: string;
  }>> {
    const communications: Array<{
      timestamp: string;
      type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
      author: string;
      message: string;
    }> = [];
    
    try {
      const response = await fetch(`${this.baseUrl}/feeditem.json?%24filter=related_object_uuid%20eq%20'${jobUuid}'&%24orderby=timestamp%20desc`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        console.log(`[Comms] feeditem endpoint returned ${response.status}`);
        return communications;
      }
      
      const items = await response.json();
      console.log(`[Comms] Fetched ${items.length} feed items for job ${jobUuid}`);
      
      for (const item of items) {
        const itemType = (item.type || '').toLowerCase();
        const timestamp = item.timestamp || '';
        const author = item.staff_name || item.author || 'System';
        const message = item.message || item.description || item.body || '';
        
        let type: "internal_note" | "sms" | "email" | "call" | "system" | "update" = 'system';
        
        if (itemType.includes('note') || itemType.includes('comment')) {
          type = 'internal_note';
        } else if (itemType.includes('sms')) {
          type = 'sms';
        } else if (itemType.includes('email')) {
          type = 'email';
        } else if (itemType.includes('call') || itemType.includes('phone')) {
          type = 'call';
        } else if (itemType.includes('status') || itemType.includes('update') || itemType.includes('change')) {
          type = 'update';
        }
        
        if (message) {
          communications.push({ timestamp, type, author, message });
        }
      }
    } catch (e) {
      console.error("[Comms] Error fetching feed items:", e);
    }
    
    return communications;
  }

  // Get full communication history for a job - combines activity and communications
  async getJobCommunicationHistory(jobUuid: string): Promise<Array<{
    timestamp: string;
    type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
    author: string;
    message: string;
  }>> {
    // Fetch both activity and communications in parallel
    const [activities, communications] = await Promise.all([
      this.fetchJobActivity(jobUuid),
      this.fetchJobCommunications(jobUuid),
    ]);
    
    // Combine and deduplicate (based on timestamp + message hash)
    const seen = new Set<string>();
    const combined: Array<{
      timestamp: string;
      type: "internal_note" | "sms" | "email" | "call" | "system" | "update";
      author: string;
      message: string;
    }> = [];
    
    for (const item of [...activities, ...communications]) {
      const key = `${item.timestamp}-${item.message.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
    }
    
    // Sort by timestamp descending (newest first)
    combined.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime() || 0;
      const dateB = new Date(b.timestamp).getTime() || 0;
      return dateB - dateA;
    });
    
    console.log(`[History] Combined ${combined.length} items for job ${jobUuid}`);
    return combined;
  }

  // Bulk fetch all companies in one API call
  async fetchAllCompanies(): Promise<Map<string, string>> {
    const companyMap = new Map<string, string>();
    try {
      const response = await fetch(`${this.baseUrl}/company.json?%24top=5000`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return companyMap;
      const companies = await response.json();
      for (const company of companies) {
        if (company.uuid && (company.name || company.company_name)) {
          companyMap.set(company.uuid, company.name || company.company_name);
        }
      }
    } catch (e) {
      console.error("Error fetching all companies:", e);
    }
    return companyMap;
  }

  // Fetch all job custom field values - custom fields in ServiceM8 are accessed via $expand
  // Returns a map of job_uuid -> { fieldName: value }
  async fetchAllJobCustomFields(): Promise<Map<string, Record<string, string>>> {
    const customFieldMap = new Map<string, Record<string, string>>();
    try {
      // In ServiceM8, custom field values are embedded in job records when using $expand=customfield_values
      // Or they can be retrieved from the jobs themselves with the field names
      // Let's fetch jobs with custom field expansion
      const response = await fetch(`${this.baseUrl}/job.json?%24filter=active%20eq%201&%24top=1000&%24expand=customfield_values`, {
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        console.error("Failed to fetch jobs with custom fields:", response.status);
        // Try alternative: jobs may already have custom fields in the response
        return customFieldMap;
      }
      
      const jobs = await response.json();
      console.log(`[CustomFields] Fetched ${jobs.length} jobs with custom field expansion`);
      
      // Log first job to see structure
      if (jobs.length > 0) {
        console.log(`[CustomFields] Sample job keys:`, Object.keys(jobs[0]));
        console.log(`[CustomFields] Sample job data:`, JSON.stringify(jobs[0], null, 2).substring(0, 1000));
      }
      
      // Extract custom field values from each job
      for (const job of jobs) {
        if (job.uuid) {
          const fieldValues: Record<string, string> = {};
          
          // Check for customfield_values array (ServiceM8's $expand format)
          if (job.customfield_values && Array.isArray(job.customfield_values)) {
            for (const cf of job.customfield_values) {
              if (cf.field_name && cf.value) {
                fieldValues[cf.field_name] = cf.value;
              }
            }
          }
          
          // Also check for direct custom field properties on the job
          // ServiceM8 sometimes returns custom fields directly with their field names
          for (const key of Object.keys(job)) {
            if (key.includes('Staff') || key.includes('staff') || key.includes('Assigned')) {
              fieldValues[key] = job[key];
              console.log(`[CustomFields] Found field "${key}" = "${job[key]}" on job ${job.generated_job_id}`);
            }
          }
          
          if (Object.keys(fieldValues).length > 0) {
            customFieldMap.set(job.uuid, fieldValues);
          }
        }
      }
      
      console.log(`[CustomFields] Mapped custom fields for ${customFieldMap.size} jobs`);
    } catch (e) {
      console.error("Error fetching job custom fields:", e);
    }
    return customFieldMap;
  }

  // Get staff assigned value for a specific job from custom fields map
  getStaffAssigned(jobUuid: string, customFieldMap: Map<string, Record<string, string>>): string {
    const jobFields = customFieldMap.get(jobUuid);
    if (!jobFields) return "Unassigned";
    
    // ServiceM8 returns custom fields with prefix "customfield_" followed by field name in snake_case
    const staffValue = jobFields['customfield_staff_assigned'] || 
                       jobFields['Staff Assigned'] || 
                       jobFields['staff_assigned'];
    return staffValue || "Unassigned";
  }

  mapServiceM8JobToInsertJob(sm8Job: ServiceM8Job, companyName?: string, customFieldMap?: Map<string, Record<string, string>>, badgeDefinitions?: Map<string, string>): InsertJob {
    const address = sm8Job.job_address || sm8Job.billing_address || "No Address";
    const quoteValue = parseFloat(sm8Job.total_invoice_amount) || 0;
    
    // Determine lifecycle phase and scheduler stage based on ServiceM8 status
    // Get staff assigned from custom fields map (custom fields are stored separately in ServiceM8)
    const staffAssigned = customFieldMap 
      ? this.getStaffAssigned(sm8Job.uuid, customFieldMap) 
      : "Unassigned";

    // Calculate time since quote was ACTUALLY SENT (not created)
    let daysSinceQuoteSent: number | null = null;
    let hoursSinceQuoteSent: number | null = null;
    // ServiceM8 fields:
    // - quote_sent: boolean flag indicating if quote was sent
    // - quote_sent_stamp: actual timestamp when quote was emailed (THIS is what we want)
    // - quote_date: when the quote was CREATED (NOT when it was sent - do NOT use this)
    const quoteSentStamp = sm8Job.quote_sent_stamp ? String(sm8Job.quote_sent_stamp).trim() : '';
    const hasQuoteSent = sm8Job.quote_sent === true;
    
    // ONLY calculate time since quote sent if we have an actual sent timestamp
    // Do NOT fall back to quote_date - that's just creation date
    // ServiceM8 stores timestamps in Perth local time (UTC+8)
    if (hasQuoteSent && quoteSentStamp && quoteSentStamp !== '' && quoteSentStamp !== '0000-00-00 00:00:00') {
      try {
        // ServiceM8 timestamps are in Perth time (UTC+8), append timezone offset
        const quoteSentDate = new Date(quoteSentStamp.replace(' ', 'T') + '+08:00');
        if (!isNaN(quoteSentDate.getTime())) {
          const now = new Date();
          const diffTime = now.getTime() - quoteSentDate.getTime();
          const totalHours = Math.floor(diffTime / (1000 * 60 * 60));
          
          if (totalHours < 24 && totalHours >= 0) {
            // Less than 24 hours - store hours
            hoursSinceQuoteSent = totalHours;
            daysSinceQuoteSent = 0;
          } else if (totalHours >= 24) {
            // 24+ hours - store days
            daysSinceQuoteSent = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            hoursSinceQuoteSent = null;
          }
        }
      } catch (e) {
        // Invalid date format, keep as null
      }
    }

    // Get base status mapping from ServiceM8 status
    let { lifecyclePhase, schedulerStage, appStatus } = this.mapServiceM8Status(sm8Job.status);
    
    // For Quote phase jobs:
    // - Leads Pipeline uses 'status': new_lead, quote_sent, etc.
    // - Quotes Pipeline uses 'salesStage': fresh, awaiting_reply (recency-based)
    // - Jobs without quote sent go to "new_lead" column
    // - Terminal statuses (unsuccessful/complete) keep their status and are excluded
    let salesStage: string | null = null;
    
    if (lifecyclePhase === 'quote' && appStatus !== 'unsuccessful') {
      if (hasQuoteSent) {
        // Quote jobs don't need a scheduler stage - they're in sales pipelines
        schedulerStage = null;
        // For Leads Pipeline: set status to quote_sent
        appStatus = 'quote_sent';
        // For Quotes Pipeline: set salesStage based on days since quote was sent
        if (daysSinceQuoteSent !== null && daysSinceQuoteSent <= 3) {
          salesStage = 'fresh';  // Fresh (0-3 Days)
        } else {
          salesStage = 'awaiting_reply';  // Awaiting Reply (4+ days)
        }
      } else {
        // No quote sent yet - this is a new lead
        appStatus = 'new_lead';
        salesStage = 'new_lead';
      }
    }

    return {
      serviceM8Uuid: sm8Job.uuid,
      jobId: sm8Job.generated_job_id ? `#${sm8Job.generated_job_id}` : "#N/A",
      customerName: companyName || "Unknown Customer",
      address: address,
      description: sm8Job.job_description || "PVC Fencing Installation",
      quoteValue: quoteValue,
      status: appStatus,
      lifecyclePhase: lifecyclePhase,
      schedulerStage: schedulerStage,
      salesStage: salesStage,
      daysSinceQuoteSent: daysSinceQuoteSent,
      hoursSinceQuoteSent: hoursSinceQuoteSent,
      daysSinceLastContact: 0,
      assignedStaff: staffAssigned,
      lastNote: sm8Job.work_done_description || "",
      urgency: "low",
      lastContactWho: "us",
      purchaseOrderStatus: "none",
      productionTasks: [],
      installStage: "pending_posts",
      estimatedProductionDuration: 7,
      postInstallDuration: 6,
      postInstallCrewSize: 2,
      panelInstallDuration: 8,
      panelInstallCrewSize: 2,
      syncedAt: new Date(),
      badges: this.parseBadges(sm8Job.badges, badgeDefinitions),
    };
  }

  private parseBadges(badgesRaw: string | undefined, badgeDefinitions?: Map<string, string>): string[] {
    if (!badgesRaw) return [];
    
    // ServiceM8 stores badges as JSON array string like '["uuid1","uuid2"]' or comma-separated
    let badgeUuids: string[] = [];
    
    try {
      // Try parsing as JSON array first
      const parsed = JSON.parse(badgesRaw);
      if (Array.isArray(parsed)) {
        badgeUuids = parsed.map((b: string) => b.trim()).filter((b: string) => b.length > 0);
      }
    } catch {
      // Fall back to comma-separated format
      badgeUuids = badgesRaw.split(',').map((b: string) => b.trim()).filter((b: string) => b.length > 0);
    }
    
    // Convert UUIDs to human-readable names if definitions available
    if (badgeDefinitions && badgeDefinitions.size > 0) {
      return badgeUuids.map(uuid => {
        const name = badgeDefinitions.get(uuid);
        return name || uuid; // Fall back to UUID if no name found
      });
    }
    
    return badgeUuids;
  }

  private mapServiceM8Status(sm8Status: string): { 
    lifecyclePhase: LifecyclePhase; 
    schedulerStage: SchedulerStage; 
    appStatus: string;
  } {
    const statusLower = sm8Status.toLowerCase();
    
    // First check for terminal/closed statuses (these should be excluded from active pipelines)
    if (statusLower.includes('unsuccessful') || statusLower.includes('lost') || statusLower.includes('cancelled') || statusLower.includes('canceled')) {
      return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'unsuccessful' };
    }
    
    // Check for completed jobs
    if (statusLower.includes('complete') || statusLower.includes('finished') || statusLower.includes('done')) {
      return { lifecyclePhase: 'work_order', schedulerStage: 'recently_completed', appStatus: 'complete' };
    }
    
    // Check if it's a Work Order status
    if (WORK_ORDER_STATUSES.some(s => statusLower.includes(s.toLowerCase()))) {
      // Map to specific scheduler stages
      if (statusLower.includes('progress') || statusLower.includes('production')) {
        return { lifecyclePhase: 'work_order', schedulerStage: 'in_production', appStatus: 'in_production' };
      }
      if (statusLower.includes('scheduled')) {
        return { lifecyclePhase: 'work_order', schedulerStage: 'in_production', appStatus: 'scheduled' };
      }
      // Default work order goes to new_jobs_won
      return { lifecyclePhase: 'work_order', schedulerStage: 'new_jobs_won', appStatus: 'work_order' };
    }
    
    // Quote phase statuses (will be further processed based on quote_sent flag)
    if (statusLower.includes('quote') || statusLower.includes('estimate')) {
      return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'quote_pending' };
    }
    if (statusLower.includes('lead')) {
      return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'new_lead' };
    }
    
    // Default to quote phase (will be processed based on quote_sent)
    return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'quote_pending' };
  }
}

export function createServiceM8Client(apiKey?: string): ServiceM8Client | null {
  const key = apiKey || process.env.SERVICEM8_API_KEY;

  if (!key) {
    console.warn("ServiceM8 API key not configured");
    return null;
  }

  return new ServiceM8Client(key);
}
