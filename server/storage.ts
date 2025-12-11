import { type Job, type InsertJob, jobs, type Staff, type InsertStaff, staff, type SyncLog, type InsertSyncLog, syncLog } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Jobs
  getAllJobs(): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  getJobByServiceM8Uuid(uuid: string): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<Job | undefined>;
  upsertJobByServiceM8Uuid(job: InsertJob): Promise<Job>;
  
  // Staff
  getAllStaff(): Promise<Staff[]>;
  getStaffMember(id: string): Promise<Staff | undefined>;
  createStaffMember(member: InsertStaff): Promise<Staff>;
  updateStaffMember(id: string, member: Partial<InsertStaff>): Promise<Staff | undefined>;
  
  // Sync Logs
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  getLatestSyncLog(): Promise<SyncLog | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Jobs
  async getAllJobs(): Promise<Job[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobByServiceM8Uuid(uuid: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.serviceM8Uuid, uuid));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values([insertJob]).returning();
    return job;
  }

  async updateJob(id: number, insertJob: Partial<InsertJob>): Promise<Job | undefined> {
    const updateData: any = { ...insertJob, updatedAt: new Date() };
    const [job] = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, id))
      .returning();
    return job || undefined;
  }

  async upsertJobByServiceM8Uuid(insertJob: InsertJob): Promise<Job> {
    const existing = await this.getJobByServiceM8Uuid(insertJob.serviceM8Uuid);
    if (existing) {
      const updated = await this.updateJob(existing.id, insertJob);
      return updated!;
    } else {
      return await this.createJob(insertJob);
    }
  }

  // Staff
  async getAllStaff(): Promise<Staff[]> {
    return await db.select().from(staff);
  }

  async getStaffMember(id: string): Promise<Staff | undefined> {
    const [member] = await db.select().from(staff).where(eq(staff.id, id));
    return member || undefined;
  }

  async createStaffMember(insertStaff: InsertStaff): Promise<Staff> {
    const [member] = await db.insert(staff).values([insertStaff]).returning();
    return member;
  }

  async updateStaffMember(id: string, insertStaff: Partial<InsertStaff>): Promise<Staff | undefined> {
    const updateData: any = insertStaff;
    const [member] = await db
      .update(staff)
      .set(updateData)
      .where(eq(staff.id, id))
      .returning();
    return member || undefined;
  }

  // Sync Logs
  async createSyncLog(insertLog: InsertSyncLog): Promise<SyncLog> {
    const [log] = await db.insert(syncLog).values([insertLog]).returning();
    return log;
  }

  async getLatestSyncLog(): Promise<SyncLog | undefined> {
    const [log] = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
    return log || undefined;
  }
}

export const storage = new DatabaseStorage();
