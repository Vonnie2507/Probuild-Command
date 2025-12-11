import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Job } from "@/lib/mockData";
import { useSettings } from "@/lib/settingsContext";
import { PipelineBoard } from "@/components/PipelineBoard";
import { ProductionDashboard } from "@/components/ProductionDashboard";
import { SchedulerDashboard } from "@/components/SchedulerDashboard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Search, Settings, Users, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { SelectJob } from "@shared/schema";

function mapDbJobToJob(dbJob: SelectJob): Job {
  return {
    id: String(dbJob.id),
    jobId: dbJob.jobId || "#N/A",
    serviceM8Uuid: dbJob.serviceM8Uuid || undefined,
    customerName: dbJob.customerName || "Unknown",
    address: dbJob.address || "",
    description: dbJob.description || "",
    quoteValue: dbJob.quoteValue || 0,
    status: dbJob.status || "new_lead",
    lifecyclePhase: (dbJob.lifecyclePhase as Job["lifecyclePhase"]) || "quote",
    schedulerStage: (dbJob.schedulerStage as Job["schedulerStage"]) || "new_jobs_won",
    daysSinceQuoteSent: dbJob.daysSinceQuoteSent ?? undefined,
    hoursSinceQuoteSent: dbJob.hoursSinceQuoteSent ?? undefined,
    daysSinceLastContact: dbJob.daysSinceLastContact || 0,
    assignedStaff: dbJob.assignedStaff || "wayne",
    lastNote: dbJob.lastNote || "",
    dateCreated: dbJob.createdAt ? new Date(dbJob.createdAt) : new Date(),
    urgency: (dbJob.urgency as Job["urgency"]) || "low",
    lastContactWho: (dbJob.lastContactWho as Job["lastContactWho"]) || "us",
    dueDate: dbJob.dueDate ? new Date(dbJob.dueDate) : undefined,
    purchaseOrderStatus: (dbJob.purchaseOrderStatus as Job["purchaseOrderStatus"]) || "none",
    productionTasks: (dbJob.productionTasks as Job["productionTasks"]) || [],
    installStage: (dbJob.installStage as Job["installStage"]) || "pending_posts",
    postInstallDate: dbJob.postInstallDate ? new Date(dbJob.postInstallDate) : undefined,
    panelInstallDate: dbJob.panelInstallDate ? new Date(dbJob.panelInstallDate) : undefined,
    tentativePostDate: dbJob.tentativePostDate ? new Date(dbJob.tentativePostDate) : undefined,
    tentativePanelDate: dbJob.tentativePanelDate ? new Date(dbJob.tentativePanelDate) : undefined,
    tentativeNotes: dbJob.tentativeNotes || undefined,
    estimatedProductionDuration: dbJob.estimatedProductionDuration || 7,
    postInstallDuration: dbJob.postInstallDuration || 6,
    postInstallCrewSize: dbJob.postInstallCrewSize || 2,
    panelInstallDuration: dbJob.panelInstallDuration || 8,
    panelInstallCrewSize: dbJob.panelInstallCrewSize || 2,
  };
}

export default function CommandCenter() {
  const queryClient = useQueryClient();
  const { staff, pipelines, appSettings } = useSettings();
  const [viewMode, setViewMode] = useState<"sales" | "production" | "scheduler">("sales");
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: dbJobs = [], isLoading } = useQuery<SelectJob[]>({
    queryKey: ["/api/jobs"],
  });

  const jobs: Job[] = dbJobs.map(mapDbJobToJob);

  const updateJobMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SelectJob> }) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const syncServiceM8 = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/servicem8", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Synced ${data.jobsProcessed} jobs from ServiceM8`);
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      } else {
        toast.error(data.message || "Sync failed");
      }
    } catch (error) {
      toast.error("Failed to sync with ServiceM8");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleJobMove = (jobId: string, newStatus: string) => {
    updateJobMutation.mutate({ id: jobId, updates: { status: newStatus } });
  };

  const handleScheduleJob = (jobId: string, type: 'posts' | 'panels', date: Date) => {
    if (type === 'posts') {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { postInstallDate: date, installStage: 'posts_scheduled' } 
      });
    } else {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { panelInstallDate: date, installStage: 'panels_scheduled' } 
      });
    }
  };

  const handleUnscheduleJob = (jobId: string, type: 'posts' | 'panels') => {
    if (type === 'posts') {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { postInstallDate: null, installStage: 'pending_posts' } 
      });
    } else {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { panelInstallDate: null, installStage: 'pending_panels' } 
      });
    }
  };

  const handleTentativeSchedule = (jobId: string, type: 'posts' | 'panels', date: Date) => {
    if (type === 'posts') {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { tentativePostDate: date, installStage: 'tentative_posts' } 
      });
    } else {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { tentativePanelDate: date, installStage: 'tentative_panels' } 
      });
    }
  };

  const handleUnscheduleTentative = (jobId: string, type: 'posts' | 'panels') => {
    if (type === 'posts') {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { tentativePostDate: null, installStage: 'pending_posts' } 
      });
    } else {
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { tentativePanelDate: null, installStage: 'pending_panels' } 
      });
    }
  };

  const handleConfirmTentative = (jobId: string, type: 'posts' | 'panels') => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    if (type === 'posts' && job.tentativePostDate) {
      if (job.tentativePostDate > twoWeeksFromNow) {
        toast.error('Cannot confirm: date is more than 2 weeks out');
        return;
      }
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { 
          postInstallDate: job.tentativePostDate, 
          tentativePostDate: null,
          installStage: 'posts_scheduled' 
        } 
      });
    } else if (type === 'panels' && job.tentativePanelDate) {
      if (job.tentativePanelDate > twoWeeksFromNow) {
        toast.error('Cannot confirm: date is more than 2 weeks out');
        return;
      }
      updateJobMutation.mutate({ 
        id: jobId, 
        updates: { 
          panelInstallDate: job.tentativePanelDate, 
          tentativePanelDate: null,
          installStage: 'panels_scheduled' 
        } 
      });
    }
  };

  const handleSchedulerStageChange = (jobId: string, newStage: string) => {
    updateJobMutation.mutate({ 
      id: jobId, 
      updates: { schedulerStage: newStage } 
    });
  };

  const filteredJobs = jobs.filter((job) => {
    const staffMatch = selectedStaff === "all" || job.assignedStaff === selectedStaff;
    const searchMatch = 
      job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.jobId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.address.toLowerCase().includes(searchQuery.toLowerCase());
    return staffMatch && searchMatch;
  });

  // Quote phase jobs for Sales section (orange cards)
  // Include: new_lead (no quote sent), fresh (0-3 days), awaiting_reply (4+ days)
  // Also include any quotes pipeline status for flexibility
  // Exclude: unsuccessful, complete (terminal statuses)
  const quoteJobs = filteredJobs.filter(job => 
    job.lifecyclePhase === 'quote' && 
    job.status !== 'unsuccessful' && 
    job.status !== 'complete'
  );
  
  // Work order phase jobs for Scheduler/Production (blue cards)
  const workOrderJobs = filteredJobs.filter(job => job.lifecyclePhase === 'work_order');

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
              <h1 className="font-heading text-xl leading-none">{appSettings.companyName}</h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">Command Center</p>
            </div>
          </div>

          <div className="h-8 w-px bg-border mx-2" />

          <div className="flex bg-muted p-1 rounded-md">
            <button
              onClick={() => setViewMode("sales")}
              data-testid="view-mode-sales"
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
              data-testid="view-mode-production"
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
              data-testid="view-mode-scheduler"
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
              data-testid="search-input"
            />
          </div>

          <div className="flex items-center gap-2 border-l pl-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter Staff:</span>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-[180px] h-9" data-testid="staff-filter">
                <SelectValue placeholder="Select Staff" />
              </SelectTrigger>
              <SelectContent>
                {staff.filter(s => s.active).map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="settings-btn">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Settings
                </DialogTitle>
              </DialogHeader>
              <SettingsPanel />
            </DialogContent>
          </Dialog>

          <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid="new-job-btn">
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
                <TabsTrigger value="leads" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="leads-tab">LEADS PIPELINE</TabsTrigger>
                <TabsTrigger value="quotes" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="quotes-tab">QUOTES PIPELINE</TabsTrigger>
              </TabsList>
              
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground hover:text-foreground" 
                data-testid="sync-btn"
                onClick={syncServiceM8}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {isSyncing ? "Syncing..." : "Sync ServiceM8"}
              </Button>
            </div>

            <TabsContent value="leads" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
               <PipelineBoard 
                  columns={pipelines.leads} 
                  jobs={quoteJobs} 
                  onJobMove={handleJobMove} 
               />
            </TabsContent>
            
            <TabsContent value="quotes" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
              <PipelineBoard 
                  columns={pipelines.quotes} 
                  jobs={quoteJobs} 
                  onJobMove={handleJobMove}
                  statusField="salesStage"
               />
            </TabsContent>
          </Tabs>
        )}

        {viewMode === "production" && (
          <ProductionDashboard jobs={filteredJobs} onJobMove={handleJobMove} />
        )}

        {viewMode === "scheduler" && (
          <SchedulerDashboard 
            jobs={workOrderJobs} 
            onJobMove={handleJobMove}
            onScheduleJob={handleScheduleJob}
            onUnscheduleJob={handleUnscheduleJob}
            onTentativeSchedule={handleTentativeSchedule}
            onUnscheduleTentative={handleUnscheduleTentative}
            onConfirmTentative={handleConfirmTentative}
            onSchedulerStageChange={handleSchedulerStageChange}
          />
        )}
      </main>
    </div>
  );
}
