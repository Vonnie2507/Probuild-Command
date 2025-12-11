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
  quote_sent: string;
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

  mapServiceM8JobToInsertJob(sm8Job: ServiceM8Job, companyName?: string): InsertJob {
    const address = sm8Job.job_address || sm8Job.billing_address || "No Address";
    const quoteValue = parseFloat(sm8Job.total_invoice_amount) || 0;
    
    // Determine lifecycle phase and scheduler stage based on ServiceM8 status
    const { lifecyclePhase, schedulerStage, appStatus } = this.mapServiceM8Status(sm8Job.status);

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
      daysSinceLastContact: 0,
      assignedStaff: "wayne",
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
    };
  }

  private mapServiceM8Status(sm8Status: string): { 
    lifecyclePhase: LifecyclePhase; 
    schedulerStage: SchedulerStage; 
    appStatus: string;
  } {
    const statusLower = sm8Status.toLowerCase();
    
    // Check if it's a Work Order status
    if (WORK_ORDER_STATUSES.some(s => statusLower.includes(s.toLowerCase()))) {
      // Map to specific scheduler stages
      if (statusLower.includes('complete')) {
        return { lifecyclePhase: 'work_order', schedulerStage: 'recently_completed', appStatus: 'complete' };
      }
      if (statusLower.includes('progress') || statusLower.includes('production')) {
        return { lifecyclePhase: 'work_order', schedulerStage: 'in_production', appStatus: 'in_production' };
      }
      if (statusLower.includes('scheduled')) {
        return { lifecyclePhase: 'work_order', schedulerStage: 'in_production', appStatus: 'scheduled' };
      }
      // Default work order goes to new_jobs_won
      return { lifecyclePhase: 'work_order', schedulerStage: 'new_jobs_won', appStatus: 'work_order' };
    }
    
    // Quote phase statuses
    if (statusLower.includes('quote') || statusLower.includes('estimate')) {
      return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'quote_sent' };
    }
    if (statusLower.includes('lead')) {
      return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'new_lead' };
    }
    
    // Default to quote phase
    return { lifecyclePhase: 'quote', schedulerStage: 'new_jobs_won', appStatus: 'new_lead' };
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
