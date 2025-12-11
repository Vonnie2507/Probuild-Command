import { type InsertJob } from "@shared/schema";

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

  mapServiceM8JobToInsertJob(sm8Job: ServiceM8Job, companyName?: string): InsertJob {
    const status = this.mapServiceM8StatusToAppStatus(sm8Job.status);
    const address = sm8Job.job_address || sm8Job.billing_address || "No Address";
    const quoteValue = parseFloat(sm8Job.total_invoice_amount) || 0;

    return {
      serviceM8Uuid: sm8Job.uuid,
      jobId: sm8Job.generated_job_id ? `#${sm8Job.generated_job_id}` : "#N/A",
      customerName: companyName || "Unknown Customer",
      address: address,
      description: sm8Job.job_description || "PVC Fencing Installation",
      quoteValue: quoteValue,
      status: status,
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

  private mapServiceM8StatusToAppStatus(sm8Status: string): string {
    // Map ServiceM8 queue statuses to app statuses
    const statusMap: Record<string, string> = {
      "New Lead": "new_lead",
      "Contacted": "contacted",
      "Quote Sent": "quote_sent",
      "Deposit Paid": "deposit_paid",
      "In Production": "man_posts",
      "Job Complete": "complete",
      // Add more mappings based on your ServiceM8 setup
    };

    return statusMap[sm8Status] || "new_lead";
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
