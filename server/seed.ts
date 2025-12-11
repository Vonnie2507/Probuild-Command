import { storage } from "./storage";
import { STAFF_MEMBERS } from "../client/src/lib/mockData";

export async function seedStaffMembers() {
  console.log("Seeding staff members...");

  for (const member of STAFF_MEMBERS) {
    if (member.id === "all") continue; // Skip the "All" filter option

    const existing = await storage.getStaffMember(member.id);
    if (!existing) {
      await storage.createStaffMember({
        id: member.id,
        name: member.name,
        role: member.role,
        dailyCapacityHours: member.dailyCapacityHours,
        skills: member.skills,
        color: member.color,
        active: true,
      });
      console.log(`Created staff member: ${member.name}`);
    }
  }

  console.log("Staff seeding complete");
}

// Work Types and their stages from CSV export
const WORK_TYPES_DATA = [
  {
    id: 1,
    name: "PVC Fencing - Supply & Install",
    description: "Standard PVC fencing supply and installation",
    color: "blue",
    isDefault: true,
    stages: [
      { name: "Manufacture Posts", key: "manufacture_posts", orderIndex: 1, category: "production", triggersScheduler: true },
      { name: "Install Posts", key: "install_posts", orderIndex: 2, category: "install", triggersScheduler: true },
      { name: "Manufacture Panels", key: "manufacture_panels", orderIndex: 3, category: "production", triggersScheduler: true },
      { name: "Install Panels", key: "install_panels", orderIndex: 4, category: "install", triggersScheduler: true },
      { name: "Job Complete", key: "job_complete", orderIndex: 5, category: "install", triggersScheduler: false },
    ]
  },
  {
    id: 3,
    name: "Supply Only - Client Pickup",
    description: "Supply only jobs where client picks up",
    color: "green",
    isDefault: false,
    stages: [
      { name: "Posts Manufacture", key: "posts_manufacturer", orderIndex: 0, category: "production", triggersScheduler: true },
      { name: "Job Pick Up By Client", key: "job_pick_up_by_client", orderIndex: 1, category: "external", triggersScheduler: false },
      { name: "Panel Manufacture", key: "panel_manufacture", orderIndex: 2, category: "production", triggersScheduler: true },
      { name: "Wrapped & Quality Checked", key: "wrapped_quality_checked", orderIndex: 3, category: "production", triggersScheduler: false },
      { name: "Client Pick Up Date (completed)", key: "client_pick_up_date_completed", orderIndex: 5, category: "external", triggersScheduler: true },
    ]
  },
  {
    id: 4,
    name: "Full Fence + Sliding Gate",
    description: "Full fence installation with sliding gate",
    color: "purple",
    isDefault: false,
    stages: [
      { name: "Purchase Order Submitted", key: "purchase_order_submitted", orderIndex: 1, category: "admin", triggersPurchaseOrder: true, triggersScheduler: true },
      { name: "Powdercoaters Notified and Time Slot Locked In", key: "powdercoaters_notified_and_time_slot_locked_in", orderIndex: 2, category: "admin", triggersPurchaseOrder: true, triggersScheduler: true },
      { name: "Posts Manufacture", key: "posts_manufacture", orderIndex: 3, category: "production", triggersScheduler: true },
      { name: "Post Install", key: "post_install", orderIndex: 4, category: "install", triggersScheduler: true },
      { name: "Panel Manufacture", key: "panel_manufacture", orderIndex: 5, category: "production", triggersScheduler: true },
      { name: "Panel Install", key: "panel_install", orderIndex: 6, category: "install", triggersScheduler: true },
      { name: "Pick up Gate From Welders", key: "pick_up_gate_from_welders", orderIndex: 7, category: "admin", triggersScheduler: true },
      { name: "Pick Up Gate from PowderCoaters", key: "pick_up_gate_from_powdercoaters", orderIndex: 8, category: "admin", triggersScheduler: true },
      { name: "Gate Manufacture", key: "gate_manufacture", orderIndex: 9, category: "production", triggersScheduler: true },
      { name: "Gate Install", key: "gate_install", orderIndex: 10, category: "production", triggersScheduler: true },
      { name: "Job Complete", key: "job_complete", orderIndex: 11, category: "install", triggersScheduler: false },
    ]
  }
];

export async function seedWorkTypes() {
  console.log("Seeding work types and stages...");

  for (const workTypeData of WORK_TYPES_DATA) {
    // Check if work type already exists by name
    const existingWorkTypes = await storage.getAllWorkTypes();
    let workType = existingWorkTypes.find(wt => wt.name === workTypeData.name);

    if (!workType) {
      // Create the work type
      workType = await storage.createWorkType({
        name: workTypeData.name,
        description: workTypeData.description,
        color: workTypeData.color,
        isDefault: workTypeData.isDefault,
        isActive: true,
      });
      console.log(`Created work type: ${workType.name} (ID: ${workType.id})`);
    } else {
      console.log(`Work type already exists: ${workType.name} (ID: ${workType.id})`);
    }

    // Get existing stages for this work type
    const existingStages = await storage.getStagesForWorkType(workType.id);

    // Add stages that don't exist
    for (const stageData of workTypeData.stages) {
      const existingStage = existingStages.find(s => s.key === stageData.key);

      if (!existingStage) {
        const stage = await storage.createWorkTypeStage({
          workTypeId: workType.id,
          name: stageData.name,
          key: stageData.key,
          orderIndex: stageData.orderIndex,
          category: stageData.category,
          triggersPurchaseOrder: stageData.triggersPurchaseOrder || false,
          triggersScheduler: stageData.triggersScheduler || false,
          subStages: [],
        });
        console.log(`  Created stage: ${stage.name} (order: ${stage.orderIndex})`);
      } else {
        console.log(`  Stage already exists: ${existingStage.name}`);
      }
    }
  }

  console.log("Work types seeding complete");
}

export async function seedAll() {
  await seedStaffMembers();
  await seedWorkTypes();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAll().then(() => process.exit(0));
}
