import { type SelectJob, type InsertJob, jobs, type Staff, type InsertStaff, staff, type SyncLog, type InsertSyncLog, syncLog, type OAuthToken, type InsertOAuthToken, oauthTokens, type WorkType, type InsertWorkType, workTypes, type WorkTypeStage, type InsertWorkTypeStage, workTypeStages, type JobStageProgress, type InsertJobStageProgress, jobStageProgress, appSettings } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc } from "drizzle-orm";

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
  
  // Work Types
  getAllWorkTypes(): Promise<WorkType[]>;
  getWorkType(id: number): Promise<WorkType | undefined>;
  createWorkType(workType: InsertWorkType): Promise<WorkType>;
  updateWorkType(id: number, workType: Partial<InsertWorkType>): Promise<WorkType | undefined>;
  deleteWorkType(id: number): Promise<boolean>;
  
  // Work Type Stages
  getStagesForWorkType(workTypeId: number): Promise<WorkTypeStage[]>;
  getWorkTypeStage(id: number): Promise<WorkTypeStage | undefined>;
  createWorkTypeStage(stage: InsertWorkTypeStage): Promise<WorkTypeStage>;
  updateWorkTypeStage(id: number, stage: Partial<InsertWorkTypeStage>): Promise<WorkTypeStage | undefined>;
  deleteWorkTypeStage(id: number): Promise<boolean>;
  reorderStages(workTypeId: number, stageIds: number[]): Promise<void>;
  
  // Job Stage Progress
  getJobStageProgress(jobId: number): Promise<JobStageProgress[]>;
  updateJobStageProgress(jobId: number, stageId: number, progress: Partial<InsertJobStageProgress>): Promise<JobStageProgress | undefined>;
  initializeJobStages(jobId: number, workTypeId: number): Promise<void>;
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

  // Work Types
  async getAllWorkTypes(): Promise<WorkType[]> {
    return await db.select().from(workTypes).orderBy(asc(workTypes.name));
  }

  async getWorkType(id: number): Promise<WorkType | undefined> {
    const [workType] = await db.select().from(workTypes).where(eq(workTypes.id, id));
    return workType || undefined;
  }

  async createWorkType(insertWorkType: InsertWorkType): Promise<WorkType> {
    const [workType] = await db.insert(workTypes).values(insertWorkType).returning();
    return workType;
  }

  async updateWorkType(id: number, updateData: Partial<InsertWorkType>): Promise<WorkType | undefined> {
    const data: any = { ...updateData, updatedAt: new Date() };
    const [workType] = await db
      .update(workTypes)
      .set(data)
      .where(eq(workTypes.id, id))
      .returning();
    return workType || undefined;
  }

  async deleteWorkType(id: number): Promise<boolean> {
    const result = await db.delete(workTypes).where(eq(workTypes.id, id));
    return true;
  }

  // Work Type Stages
  async getStagesForWorkType(workTypeId: number): Promise<WorkTypeStage[]> {
    return await db
      .select()
      .from(workTypeStages)
      .where(eq(workTypeStages.workTypeId, workTypeId))
      .orderBy(asc(workTypeStages.orderIndex));
  }

  async getWorkTypeStage(id: number): Promise<WorkTypeStage | undefined> {
    const [stage] = await db.select().from(workTypeStages).where(eq(workTypeStages.id, id));
    return stage || undefined;
  }

  async createWorkTypeStage(insertStage: InsertWorkTypeStage): Promise<WorkTypeStage> {
    const [stage] = await db.insert(workTypeStages).values(insertStage).returning();
    return stage;
  }

  async updateWorkTypeStage(id: number, updateData: Partial<InsertWorkTypeStage>): Promise<WorkTypeStage | undefined> {
    const [stage] = await db
      .update(workTypeStages)
      .set(updateData)
      .where(eq(workTypeStages.id, id))
      .returning();
    return stage || undefined;
  }

  async deleteWorkTypeStage(id: number): Promise<boolean> {
    await db.delete(workTypeStages).where(eq(workTypeStages.id, id));
    return true;
  }

  async reorderStages(workTypeId: number, stageIds: number[]): Promise<void> {
    for (let i = 0; i < stageIds.length; i++) {
      await db
        .update(workTypeStages)
        .set({ orderIndex: i })
        .where(and(eq(workTypeStages.id, stageIds[i]), eq(workTypeStages.workTypeId, workTypeId)));
    }
  }

  // Job Stage Progress
  async getJobStageProgress(jobId: number): Promise<JobStageProgress[]> {
    return await db
      .select()
      .from(jobStageProgress)
      .where(eq(jobStageProgress.jobId, jobId));
  }

  async updateJobStageProgress(jobId: number, stageId: number, updateData: Partial<InsertJobStageProgress>): Promise<JobStageProgress | undefined> {
    // First try to update existing record
    const data: any = { ...updateData, updatedAt: new Date() };
    const [existing] = await db
      .update(jobStageProgress)
      .set(data)
      .where(and(eq(jobStageProgress.jobId, jobId), eq(jobStageProgress.stageId, stageId)))
      .returning();
    
    if (existing) return existing;
    
    // If no existing record, create one
    const insertData: any = { 
      jobId, 
      stageId, 
      status: updateData.status || 'pending',
      ...updateData 
    };
    if (updateData.status === 'completed') {
      insertData.completedAt = new Date();
    }
    
    const [created] = await db
      .insert(jobStageProgress)
      .values(insertData)
      .returning();
    return created;
  }

  async initializeJobStages(jobId: number, workTypeId: number): Promise<void> {
    const stages = await this.getStagesForWorkType(workTypeId);
    for (const stage of stages) {
      await db.insert(jobStageProgress).values({
        jobId,
        stageId: stage.id,
        status: 'pending',
      }).onConflictDoNothing();
    }
  }

  // Timer operations
  async startTimer(jobId: number, stageId: number): Promise<JobStageProgress | undefined> {
    const now = new Date();
    const [progress] = await db
      .update(jobStageProgress)
      .set({ 
        timerRunning: true, 
        timerStartedAt: now,
        status: 'in_progress',
        updatedAt: now 
      })
      .where(and(eq(jobStageProgress.jobId, jobId), eq(jobStageProgress.stageId, stageId)))
      .returning();
    return progress || undefined;
  }

  async stopTimer(jobId: number, stageId: number): Promise<JobStageProgress | undefined> {
    // First get current state to calculate elapsed time
    const [current] = await db
      .select()
      .from(jobStageProgress)
      .where(and(eq(jobStageProgress.jobId, jobId), eq(jobStageProgress.stageId, stageId)));
    
    if (!current || !current.timerRunning || !current.timerStartedAt) {
      return current || undefined;
    }
    
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - current.timerStartedAt.getTime()) / 1000);
    const newTotal = (current.totalTimeSeconds || 0) + elapsed;
    
    const [progress] = await db
      .update(jobStageProgress)
      .set({ 
        timerRunning: false, 
        timerStartedAt: null,
        totalTimeSeconds: newTotal,
        updatedAt: now 
      })
      .where(and(eq(jobStageProgress.jobId, jobId), eq(jobStageProgress.stageId, stageId)))
      .returning();
    return progress || undefined;
  }

  async getOrCreateStageProgress(jobId: number, stageId: number): Promise<JobStageProgress> {
    const [existing] = await db
      .select()
      .from(jobStageProgress)
      .where(and(eq(jobStageProgress.jobId, jobId), eq(jobStageProgress.stageId, stageId)));
    
    if (existing) return existing;
    
    const [created] = await db
      .insert(jobStageProgress)
      .values({ jobId, stageId, status: 'pending' })
      .returning();
    return created;
  }

  // App Settings
  async getAppSetting(key: string): Promise<any | undefined> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value;
  }

  async getAllAppSettings(): Promise<Record<string, any>> {
    const rows = await db.select().from(appSettings);
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async setAppSetting(key: string, value: any): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() }
      });
  }

  async saveAllAppSettings(settings: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setAppSetting(key, value);
    }
  }
}

export const storage = new DatabaseStorage();
