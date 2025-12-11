import { addDays, subDays } from "date-fns";

export interface Job {
  id: string;
  jobId: string; // ServiceM8 ID like #1042
  customerName: string;
  address: string;
  description: string;
  quoteValue: number;
  status: string; // The raw ServiceM8 status or our mapped column
  daysSinceQuoteSent?: number;
  daysSinceLastContact: number;
  assignedStaff: string;
  lastNote: string;
  dateCreated: Date;
  urgency: "low" | "medium" | "high" | "critical";
  lastContactWho: "us" | "client";
  dueDate?: Date;
  purchaseOrderStatus: "none" | "ordered" | "received" | "delayed";
  productionTasks: { id: string; name: string; completed: boolean; assignedTo?: string }[];
  installDate?: Date;
  installTeam?: string;
  readyForInstall: boolean;
}

export type StaffMember = {
  id: string;
  name: string;
  role: "sales" | "production" | "install";
  avatar?: string;
};

export const STAFF_MEMBERS: StaffMember[] = [
  { id: "all", name: "All Staff", role: "sales" },
  { id: "wayne", name: "Wayne", role: "sales" },
  { id: "dave", name: "Dave", role: "sales" },
  { id: "craig", name: "Craig", role: "production" },
  { id: "sarah", name: "Sarah", role: "production" },
  { id: "mike", name: "Mike", role: "install" },
  { id: "tom", name: "Tom", role: "install" },
];

// Pipeline Columns Configuration
export const PIPELINES = {
  leads: [
    { id: "new_lead", title: "New Lead" },
    { id: "contacted", title: "Contacted/Waiting" },
    { id: "need_quote", title: "Need to Quote" },
    { id: "book_inspection", title: "Book Inspection" },
    { id: "quote_sent", title: "Quote Sent" },
    { id: "deposit_paid", title: "Deposit Paid" },
  ],
  quotes: [
    { id: "fresh", title: "Fresh (0-3 Days)" },
    { id: "in_discussion", title: "In Discussion" },
    { id: "awaiting_reply", title: "Awaiting Reply" },
    { id: "follow_up", title: "Follow Up Required" },
    { id: "hot", title: "Hot Lead" },
    { id: "revision", title: "Revision Requested" },
    { id: "on_hold", title: "On Hold" },
    { id: "lost", title: "Lost" },
  ],
  production: [
    { id: "man_posts", title: "Manufacture Posts" },
    { id: "inst_posts", title: "Install Posts" },
    { id: "man_panels", title: "Manufacture Panels" },
    { id: "inst_panels", title: "Install Panels" },
    { id: "complete", title: "Complete" },
  ],
};

const generateJobs = (): Job[] => {
  const jobs: Job[] = [];
  
  // Helpers
  const statuses = [
    ...PIPELINES.leads.map(c => c.id),
    ...PIPELINES.quotes.map(c => c.id),
    ...PIPELINES.production.map(c => c.id)
  ];
  
  const addresses = [
    "123 Palm Ave, Gold Coast",
    "45 Sunshine Blvd, Miami",
    "88 Hinterland Dr, Nerang",
    "12 Beach Rd, Burleigh",
    "56 River Tce, Surfers Paradise",
    "99 Valley Way, Currumbin",
  ];

  const customers = [
    "John Smith", "Sarah Jones", "Mike Brown", "Emma Wilson", 
    "Pro Build Constructions", "Coastal Developers", "Lisa Taylor"
  ];

  for (let i = 1; i <= 35; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const isQuotePhase = PIPELINES.quotes.some(c => c.id === status);
    const quoteSentDays = isQuotePhase ? Math.floor(Math.random() * 20) : undefined;
    const isProduction = PIPELINES.production.some(c => c.id === status);
    
    jobs.push({
      id: `job-${i}`,
      jobId: `#${1000 + i}`,
      customerName: customers[Math.floor(Math.random() * customers.length)],
      address: addresses[Math.floor(Math.random() * addresses.length)],
      description: "PVC Fencing Installation - 25m Boundary + Gates",
      quoteValue: Math.floor(Math.random() * 15000) + 2000,
      status: status,
      daysSinceQuoteSent: quoteSentDays,
      daysSinceLastContact: Math.floor(Math.random() * 10),
      assignedStaff: STAFF_MEMBERS[Math.floor(Math.random() * (STAFF_MEMBERS.length - 1)) + 1].id, // Exclude "All"
      lastNote: "Client asked about matching the gate color to the roof.",
      dateCreated: subDays(new Date(), Math.floor(Math.random() * 60)),
      urgency: Math.random() > 0.8 ? "critical" : Math.random() > 0.5 ? "high" : "low",
      lastContactWho: Math.random() > 0.5 ? "us" : "client",
      dueDate: isProduction ? addDays(new Date(), Math.floor(Math.random() * 14)) : undefined,
      purchaseOrderStatus: Math.random() > 0.7 ? "ordered" : Math.random() > 0.9 ? "received" : "none",
      productionTasks: [
        { id: "t1", name: "Cut Posts", completed: Math.random() > 0.5 },
        { id: "t2", name: "Route Rails", completed: Math.random() > 0.5 },
        { id: "t3", name: "Pack Accessories", completed: false }
      ],
      readyForInstall: isProduction && Math.random() > 0.6,
      installDate: isProduction && Math.random() > 0.6 ? addDays(new Date(), Math.floor(Math.random() * 20)) : undefined,
    });
  }

  return jobs;
};

export const MOCK_JOBS = generateJobs();
