import { type SelectJob, type InsertJob, jobs, type Staff, type InsertStaff, staff, type SyncLog, type InsertSyncLog, syncLog, type OAuthToken, type InsertOAuthToken, oauthTokens } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Jobs
  getAllJobs(): Promise<SelectJob[]>;
  getJob(id: number): Promise<SelectJob | undefined>;
  getJobByServiceM8Uuid(uuid: string): Promise<SelectJob | undefined>;
  createJob(job: InsertJob): Promise<SelectJob>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<SelectJob | undefined>;
  upsertJobByServiceM8Uuid(job: InsertJob): Promise<SelectJob>;
  
  // Staff
  getAllStaff(): Promise<Staff[]>;
  getStaffMember(id: string): Promise<Staff | undefined>;
  createStaffMember(member: InsertStaff): Promise<Staff>;
  updateStaffMember(id: string, member: Partial<InsertStaff>): Promise<Staff | undefined>;
  
  // Sync Logs
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: number, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined>;
  getLatestSyncLog(): Promise<SyncLog | undefined>;
  
  // OAuth Tokens
  getOAuthToken(provider: string): Promise<OAuthToken | undefined>;
  saveOAuthToken(token: InsertOAuthToken): Promise<OAuthToken>;
  updateOAuthToken(id: number, token: Partial<InsertOAuthToken>): Promise<OAuthToken | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Jobs
  async getAllJobs(): Promise<SelectJob[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number): Promise<SelectJob | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobByServiceM8Uuid(uuid: string): Promise<SelectJob | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.serviceM8Uuid, uuid));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<SelectJob> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(id: number, insertJob: Partial<InsertJob>): Promise<SelectJob | undefined> {
    const updateData: any = { ...insertJob, updatedAt: new Date() };
    const [job] = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, id))
      .returning();
    return job || undefined;
  }

  async upsertJobByServiceM8Uuid(insertJob: InsertJob): Promise<SelectJob> {
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
    const [member] = await db.insert(staff).values(insertStaff).returning();
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
    const [log] = await db.insert(syncLog).values(insertLog).returning();
    return log;
  }

  async updateSyncLog(id: number, updateData: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const [log] = await db
      .update(syncLog)
      .set(updateData)
      .where(eq(syncLog.id, id))
      .returning();
    return log || undefined;
  }

  async getLatestSyncLog(): Promise<SyncLog | undefined> {
    const [log] = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
    return log || undefined;
  }

  // OAuth Tokens
  async getOAuthToken(provider: string): Promise<OAuthToken | undefined> {
    const [token] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, provider)).orderBy(desc(oauthTokens.updatedAt)).limit(1);
    return token || undefined;
  }

  async saveOAuthToken(insertToken: InsertOAuthToken): Promise<OAuthToken> {
    const existing = await this.getOAuthToken(insertToken.provider || 'servicem8');
    if (existing) {
      const updated = await this.updateOAuthToken(existing.id, insertToken);
      return updated!;
    }
    const [token] = await db.insert(oauthTokens).values(insertToken).returning();
    return token;
  }

  async updateOAuthToken(id: number, updateData: Partial<InsertOAuthToken>): Promise<OAuthToken | undefined> {
    const data: any = { ...updateData, updatedAt: new Date() };
    const [token] = await db
      .update(oauthTokens)
      .set(data)
      .where(eq(oauthTokens.id, id))
      .returning();
    return token || undefined;
  }
}

export const storage = new DatabaseStorage();
