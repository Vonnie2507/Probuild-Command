import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Lifecycle phases for job categorization
export const LIFECYCLE_PHASES = ['quote', 'work_order'] as const;
export type LifecyclePhase = typeof LIFECYCLE_PHASES[number];

// Scheduler stages for work order Kanban
export const SCHEDULER_STAGES = [
  'new_jobs_won',
  'in_production', 
  'waiting_supplier',
  'waiting_client',
  'need_to_go_back',
  'recently_completed'
] as const;
export type SchedulerStage = typeof SCHEDULER_STAGES[number];

// Jobs Table
export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serviceM8Uuid: text("service_m8_uuid").unique().notNull(),
  jobId: text("job_id").notNull(), // Display ID like #1042
  customerName: text("customer_name").notNull(),
  address: text("address").notNull(),
  description: text("description"),
  quoteValue: real("quote_value"),
  status: text("status").notNull(),
  lifecyclePhase: text("lifecycle_phase").notNull().default("quote"), // 'quote' | 'work_order'
  schedulerStage: text("scheduler_stage").notNull().default("new_jobs_won"), // Kanban column for work orders
  daysSinceQuoteSent: integer("days_since_quote_sent"),
  daysSinceLastContact: integer("days_since_last_contact").notNull(),
  assignedStaff: text("assigned_staff"),
  lastNote: text("last_note"),
  urgency: text("urgency").notNull(),
  lastContactWho: text("last_contact_who"),
  dueDate: timestamp("due_date"),
  purchaseOrderStatus: text("purchase_order_status").notNull().default("none"),
  productionTasks: jsonb("production_tasks").$type<{ id: string; name: string; completed: boolean; assignedTo?: string }[]>(),
  installStage: text("install_stage").notNull().default("pending_posts"),
  postInstallDate: timestamp("post_install_date"),
  panelInstallDate: timestamp("panel_install_date"),
  tentativePostDate: timestamp("tentative_post_date"),
  tentativePanelDate: timestamp("tentative_panel_date"),
  tentativeNotes: text("tentative_notes"),
  estimatedProductionDuration: integer("estimated_production_duration"),
  postInstallDuration: integer("post_install_duration"),
  postInstallCrewSize: integer("post_install_crew_size"),
  panelInstallDuration: integer("panel_install_duration"),
  panelInstallCrewSize: integer("panel_crew_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  syncedAt: timestamp("synced_at"),
  workTypeId: integer("work_type_id"), // References work_types table for dynamic stages
  currentStageId: integer("current_stage_id"), // Current active stage
});

export const insertJobSchema = createInsertSchema(jobs, {
  serviceM8Uuid: z.string(),
  jobId: z.string(),
  customerName: z.string(),
  address: z.string(),
  status: z.string(),
  daysSinceLastContact: z.number(),
  urgency: z.string(),
  purchaseOrderStatus: z.string().optional(),
  installStage: z.string().optional(),
});

export type InsertJob = typeof jobs.$inferInsert;
export type SelectJob = typeof jobs.$inferSelect;

// Staff Members Table
export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  dailyCapacityHours: integer("daily_capacity_hours").notNull().default(8),
  skills: jsonb("skills").$type<string[]>(),
  color: text("color").notNull().default("bg-gray-500"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStaffSchema = createInsertSchema(staff, {
  id: z.string(),
  name: z.string(),
  role: z.string(),
});

export type InsertStaff = typeof staff.$inferInsert;
export type Staff = typeof staff.$inferSelect;

// ServiceM8 Sync Log
export const syncLog = pgTable("sync_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  syncType: text("sync_type").notNull(), // 'full' | 'incremental' | 'webhook'
  status: text("status").notNull(), // 'success' | 'error' | 'partial'
  jobsProcessed: integer("jobs_processed"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertSyncLogSchema = createInsertSchema(syncLog, {
  syncType: z.string(),
  status: z.string(),
  startedAt: z.date(),
});

export type InsertSyncLog = typeof syncLog.$inferInsert;
export type SyncLog = typeof syncLog.$inferSelect;

// OAuth Tokens Table (for ServiceM8 OAuth 2.0)
export const oauthTokens = pgTable("oauth_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  provider: text("provider").notNull().default("servicem8"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOAuthTokenSchema = createInsertSchema(oauthTokens, {
  provider: z.string(),
  accessToken: z.string(),
});

export type InsertOAuthToken = typeof oauthTokens.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;

// Work Types Table - Defines different job types (e.g., "Supply Only", "Supply & Install", "Supply & Install with Sliding Gate")
export const workTypes = pgTable("work_types", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("blue"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWorkTypeSchema = createInsertSchema(workTypes, {
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export type InsertWorkType = typeof workTypes.$inferInsert;
export type WorkType = typeof workTypes.$inferSelect;

// Stage Categories - determines where the stage appears in the UI
export const STAGE_CATEGORIES = ['purchase_order', 'production', 'install', 'external', 'admin'] as const;
export type StageCategory = typeof STAGE_CATEGORIES[number];

// Work Type Stages Table - Defines ordered stages for each work type
export const workTypeStages = pgTable("work_type_stages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workTypeId: integer("work_type_id").notNull().references(() => workTypes.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  key: text("key").notNull(), // Unique identifier like 'manufacture_posts', 'install_panels'
  orderIndex: integer("order_index").notNull(),
  category: text("category").notNull().default("production"), // 'purchase_order' | 'production' | 'install' | 'external' | 'admin'
  description: text("description"),
  triggersPurchaseOrder: boolean("triggers_purchase_order").notNull().default(false), // When checked, job appears in PO tab
  triggersScheduler: boolean("triggers_scheduler").notNull().default(false), // When checked, job appears in scheduler for install
  schedulerStageTarget: text("scheduler_stage_target"), // Which scheduler column to trigger (e.g., 'pending_posts')
  estimatedDuration: integer("estimated_duration"), // Default duration in hours
  requiredCrewSize: integer("required_crew_size"), // Default crew size
  subStages: jsonb("sub_stages").$type<{ id: string; name: string; order: number }[]>(), // Sub-stages like "pickup from welders", "take to powder coaters"
  dependsOnStageId: integer("depends_on_stage_id"), // Stage that must be completed before this one can start
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkTypeStageSchema = createInsertSchema(workTypeStages, {
  workTypeId: z.number(),
  name: z.string().min(1, "Name is required"),
  key: z.string().min(1, "Key is required"),
  orderIndex: z.number(),
});

export type InsertWorkTypeStage = typeof workTypeStages.$inferInsert;
export type WorkTypeStage = typeof workTypeStages.$inferSelect;

// Job Stage Progress Table - Tracks completion of stages for each job
export const jobStageProgress = pgTable("job_stage_progress", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  stageId: integer("stage_id").notNull().references(() => workTypeStages.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default("pending"), // 'pending' | 'in_progress' | 'completed' | 'skipped'
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
  notes: text("notes"),
  subStageProgress: jsonb("sub_stage_progress").$type<{ id: string; completed: boolean; completedAt?: string }[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertJobStageProgressSchema = createInsertSchema(jobStageProgress, {
  jobId: z.number(),
  stageId: z.number(),
});

export type InsertJobStageProgress = typeof jobStageProgress.$inferInsert;
export type JobStageProgress = typeof jobStageProgress.$inferSelect;
