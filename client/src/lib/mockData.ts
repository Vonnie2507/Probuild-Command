import { addDays, subDays } from "date-fns";

export type LifecyclePhase = 'quote' | 'work_order';
export type SchedulerStage = 'new_jobs_won' | 'in_production' | 'waiting_supplier' | 'waiting_client' | 'need_to_go_back' | 'recently_completed';

export interface Job {
  id: string;
  jobId: string; // ServiceM8 ID like #1042
  serviceM8Uuid?: string; // UUID for linking to ServiceM8
  customerName: string;
  address: string;
  description: string;
  quoteValue: number;
  status: string; // The raw ServiceM8 status or our mapped column
  lifecyclePhase: LifecyclePhase; // 'quote' (orange) or 'work_order' (blue)
  schedulerStage: SchedulerStage; // Kanban column for work orders
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
  installStage: 'pending_posts' | 'tentative_posts' | 'posts_scheduled' | 'measuring' | 'manufacturing_panels' | 'pending_panels' | 'tentative_panels' | 'panels_scheduled' | 'completed';
  postInstallDate?: Date;
  panelInstallDate?: Date;
  estimatedProductionDuration: number; // days
  
  // Tentative scheduling (advance planning)
  tentativePostDate?: Date;
  tentativePanelDate?: Date;
  tentativeNotes?: string;
  
  // Confirmed scheduling fields
  postInstallDuration: number; // hours
  postInstallCrewSize: number;
  panelInstallDuration: number; // hours
  panelInstallCrewSize: number;
  
  // Work type for dynamic stage tracking
  workTypeId?: number;
  
  // Communication tracking
  lastCommunicationDate?: Date;
  lastCommunicationType?: 'email' | 'sms' | 'call' | 'note';
}

// Scheduler Kanban columns for work orders
export const SCHEDULER_COLUMNS = [
  { id: 'new_jobs_won', title: 'New Jobs Won' },
  { id: 'in_production', title: 'In Production' },
  { id: 'waiting_supplier', title: 'Waiting on Supplier/Parts' },
  { id: 'waiting_client', title: 'Waiting on Client' },
  { id: 'need_to_go_back', title: 'Need to Go Back' },
  { id: 'recently_completed', title: 'Recently Completed' },
] as const;

export type StaffMember = {
  id: string;
  name: string;
  role: "sales" | "production" | "install";
  avatar?: string;
  
  // New capability fields
  dailyCapacityHours: number;
  skills: ("posts" | "panels" | "production")[];
  color: string;
};

export const STAFF_MEMBERS: StaffMember[] = [
  { id: "all", name: "All Staff", role: "sales", dailyCapacityHours: 0, skills: [], color: "bg-gray-500" },
  { id: "wayne", name: "Wayne", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500" },
  { id: "dave", name: "Dave", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500" },
  { id: "craig", name: "Craig", role: "production", dailyCapacityHours: 8, skills: ["production"], color: "bg-amber-500" },
  { id: "sarah", name: "Sarah", role: "production", dailyCapacityHours: 8, skills: ["production"], color: "bg-amber-500" },
  
  // Install Team A
  { id: "mike", name: "Mike (Team A)", role: "install", dailyCapacityHours: 8, skills: ["posts", "panels"], color: "bg-emerald-500" },
  { id: "tom", name: "Tom (Team A)", role: "install", dailyCapacityHours: 8, skills: ["posts", "panels"], color: "bg-emerald-500" },
  
  // Install Team B
  { id: "josh", name: "Josh (Team B)", role: "install", dailyCapacityHours: 8, skills: ["posts", "panels"], color: "bg-indigo-500" },
  { id: "sam", name: "Sam (Team B)", role: "install", dailyCapacityHours: 8, skills: ["posts", "panels"], color: "bg-indigo-500" },
];

export const getDailyInstallCapacity = () => {
  // Simple calculation: Sum of all install staff hours
  return STAFF_MEMBERS
    .filter(s => s.role === "install")
    .reduce((sum, staff) => sum + staff.dailyCapacityHours, 0);
};

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
    { id: "work_order", title: "Work Orders" },
    { id: "man_posts", title: "Manufacture Posts" },
    { id: "inst_posts", title: "Install Posts" },
    { id: "man_panels", title: "Manufacture Panels" },
    { id: "inst_panels", title: "Install Panels" },
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
    
    // Determine install stage based on status
    let installStage: Job['installStage'] = 'pending_posts';
    let postDate: Date | undefined = undefined;
    let panelDate: Date | undefined = undefined;
    let tentativePostDate: Date | undefined = undefined;
    let tentativePanelDate: Date | undefined = undefined;

    if (isProduction) {
       const r = Math.random();
       if (r > 0.8) {
         installStage = 'completed';
         postDate = subDays(new Date(), 20);
         panelDate = subDays(new Date(), 5);
       } else if (r > 0.6) {
         installStage = 'panels_scheduled';
         postDate = subDays(new Date(), 15);
         panelDate = addDays(new Date(), 5);
       } else if (r > 0.4) {
         installStage = 'pending_panels';
         postDate = subDays(new Date(), 10);
       } else if (r > 0.3) {
         installStage = 'posts_scheduled';
         postDate = addDays(new Date(), 3);
       } else {
         installStage = 'pending_posts';
       }
    }
    
    // Add tentative dates for some jobs (planning ahead)
    if (!isProduction && Math.random() > 0.6) {
      tentativePostDate = addDays(new Date(), Math.floor(Math.random() * 30) + 7);
      tentativePanelDate = addDays(tentativePostDate, Math.floor(Math.random() * 7) + 3);
      installStage = 'tentative_posts';
    }

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
      installStage: installStage,
      postInstallDate: postDate,
      panelInstallDate: panelDate,
      tentativePostDate: tentativePostDate,
      tentativePanelDate: tentativePanelDate,
      estimatedProductionDuration: Math.floor(Math.random() * 10) + 5,
      
      // New random estimates
      postInstallDuration: [4, 6, 8, 12][Math.floor(Math.random() * 4)],
      postInstallCrewSize: 2,
      panelInstallDuration: [4, 6, 8, 16][Math.floor(Math.random() * 4)],
      panelInstallCrewSize: 2,
    });
  }

  return jobs;
};

export const MOCK_JOBS = generateJobs();
