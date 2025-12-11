import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  estimatedProductionDuration: integer("estimated_production_duration"),
  postInstallDuration: integer("post_install_duration"),
  postInstallCrewSize: integer("post_install_crew_size"),
  panelInstallDuration: integer("panel_install_duration"),
  panelInstallCrewSize: integer("panel_crew_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  syncedAt: timestamp("synced_at"),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

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

export const insertStaffSchema = createInsertSchema(staff).omit({
  createdAt: true,
});

export type InsertStaff = z.infer<typeof insertStaffSchema>;
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

export const insertSyncLogSchema = createInsertSchema(syncLog).omit({
  id: true,
});

export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLog.$inferSelect;
