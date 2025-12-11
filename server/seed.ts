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

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedStaffMembers().then(() => process.exit(0));
}
