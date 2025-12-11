import { type InsertJob } from "@shared/schema";

interface ServiceM8Job {
  uuid: string;
  job_number: string;
  company_name: string;
  first_name: string;
  last_name: string;
  billing_address: string;
  status: string;
  description: string;
  total: number;
  active: number;
  [key: string]: any;
}

export class ServiceM8Client {
  private baseUrl = "https://api.servicem8.com/api_1.0";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchJobs(limit: number = 100): Promise<ServiceM8Job[]> {
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

  mapServiceM8JobToInsertJob(sm8Job: ServiceM8Job): InsertJob {
    const customerName = sm8Job.company_name || `${sm8Job.first_name} ${sm8Job.last_name}`.trim();
    const status = this.mapServiceM8StatusToAppStatus(sm8Job.status);

    return {
      serviceM8Uuid: sm8Job.uuid,
      jobId: `#${sm8Job.job_number}`,
      customerName: customerName || "Unknown Customer",
      address: sm8Job.billing_address || "No Address",
      description: sm8Job.description || "PVC Fencing Installation",
      quoteValue: sm8Job.total || 0,
      status: status,
      daysSinceLastContact: 0,
      assignedStaff: "wayne", // Default assignment
      lastNote: "",
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
