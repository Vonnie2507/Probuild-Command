import { useState } from "react";
import { MOCK_JOBS, PIPELINES, STAFF_MEMBERS, Job, StaffMember } from "@/lib/mockData";
import { PipelineBoard } from "@/components/PipelineBoard";
import { ProductionDashboard } from "@/components/ProductionDashboard";
import { SchedulerDashboard } from "@/components/SchedulerDashboard";
import { StaffManagement } from "@/components/StaffManagement";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Search, Settings, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function CommandCenter() {
  const [viewMode, setViewMode] = useState<"sales" | "production" | "scheduler">("sales");
  const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(STAFF_MEMBERS);
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);

  const handleJobMove = (jobId: string, newStatus: string) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, status: newStatus } : job
      )
    );
  };

  const handleScheduleJob = (jobId: string, type: 'posts' | 'panels', date: Date) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        
        if (type === 'posts') {
          return {
            ...job,
            postInstallDate: date,
            installStage: 'posts_scheduled' as const,
          };
        } else {
          return {
            ...job,
            panelInstallDate: date,
            installStage: 'panels_scheduled' as const,
          };
        }
      })
    );
  };

  const handleUpdateStaff = (updatedStaff: StaffMember) => {
    setStaffMembers((prev) =>
      prev.map((s) => (s.id === updatedStaff.id ? updatedStaff : s))
    );
  };

  const handleAddStaff = (newStaff: StaffMember) => {
    setStaffMembers((prev) => [...prev, newStaff]);
  };

  const handleDeleteStaff = (staffId: string) => {
    setStaffMembers((prev) => prev.filter((s) => s.id !== staffId));
  };

  const filteredJobs = jobs.filter((job) => {
    const staffMatch = selectedStaff === "all" || job.assignedStaff === selectedStaff;
    const searchMatch = 
      job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.jobId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.address.toLowerCase().includes(searchQuery.toLowerCase());
    return staffMatch && searchMatch;
  });

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
              <span className="font-heading font-bold text-primary-foreground text-lg">P</span>
            </div>
            <div>
              <h1 className="font-heading text-xl leading-none">PROBUILD</h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">Command Center</p>
            </div>
          </div>

          <div className="h-8 w-px bg-border mx-2" />

          <div className="flex bg-muted p-1 rounded-md">
            <button
              onClick={() => setViewMode("sales")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all",
                viewMode === "sales" 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Sales
            </button>
            <button
              onClick={() => setViewMode("production")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all",
                viewMode === "production" 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Production
            </button>
            <button
              onClick={() => setViewMode("scheduler")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all",
                viewMode === "scheduler" 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Scheduler
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search jobs, customers..." 
              className="pl-9 h-9 bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 border-l pl-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter Staff:</span>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Select Staff" />
              </SelectTrigger>
              <SelectContent>
                {STAFF_MEMBERS.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="manage-staff-btn">
                <Users className="h-4 w-4 mr-2" />
                Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Staff Management
                </DialogTitle>
              </DialogHeader>
              <StaffManagement 
                staff={staffMembers}
                onUpdateStaff={handleUpdateStaff}
                onAddStaff={handleAddStaff}
                onDeleteStaff={handleDeleteStaff}
              />
            </DialogContent>
          </Dialog>

          <Button size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6 pt-4">
        {viewMode === "sales" && (
          <Tabs defaultValue="leads" className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <TabsList className="h-10 bg-muted/50 p-1">
                <TabsTrigger value="leads" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">LEADS PIPELINE</TabsTrigger>
                <TabsTrigger value="quotes" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">QUOTES PIPELINE</TabsTrigger>
              </TabsList>
              
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync ServiceM8
              </Button>
            </div>

            <TabsContent value="leads" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
               <PipelineBoard 
                  columns={PIPELINES.leads} 
                  jobs={filteredJobs} 
                  onJobMove={handleJobMove} 
               />
            </TabsContent>
            
            <TabsContent value="quotes" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
              <PipelineBoard 
                  columns={PIPELINES.quotes} 
                  jobs={filteredJobs} 
                  onJobMove={handleJobMove} 
               />
            </TabsContent>
          </Tabs>
        )}

        {viewMode === "production" && (
          <ProductionDashboard jobs={filteredJobs} onJobMove={handleJobMove} />
        )}

        {viewMode === "scheduler" && (
          <SchedulerDashboard 
            jobs={filteredJobs} 
            onJobMove={handleJobMove}
            onScheduleJob={handleScheduleJob}
          />
        )}
      </main>
    </div>
  );
}
