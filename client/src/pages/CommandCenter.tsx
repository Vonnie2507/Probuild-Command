import { useState } from "react";
import { MOCK_JOBS, Job } from "@/lib/mockData";
import { useSettings } from "@/lib/settingsContext";
import { PipelineBoard } from "@/components/PipelineBoard";
import { ProductionDashboard } from "@/components/ProductionDashboard";
import { SchedulerDashboard } from "@/components/SchedulerDashboard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Search, Settings, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function CommandCenter() {
  const { staff, pipelines, appSettings } = useSettings();
  const [viewMode, setViewMode] = useState<"sales" | "production" | "scheduler">("sales");
  const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const handleUnscheduleJob = (jobId: string, type: 'posts' | 'panels') => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        
        if (type === 'posts') {
          return {
            ...job,
            postInstallDate: undefined,
            installStage: 'pending_posts' as const,
          };
        } else {
          return {
            ...job,
            panelInstallDate: undefined,
            installStage: 'pending_panels' as const,
          };
        }
      })
    );
  };

  const handleTentativeSchedule = (jobId: string, type: 'posts' | 'panels', date: Date) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        
        if (type === 'posts') {
          return {
            ...job,
            tentativePostDate: date,
            installStage: 'tentative_posts' as const,
          };
        } else {
          return {
            ...job,
            tentativePanelDate: date,
            installStage: 'tentative_panels' as const,
          };
        }
      })
    );
  };

  const handleUnscheduleTentative = (jobId: string, type: 'posts' | 'panels') => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        
        if (type === 'posts') {
          return {
            ...job,
            tentativePostDate: undefined,
            installStage: 'pending_posts' as const,
          };
        } else {
          return {
            ...job,
            tentativePanelDate: undefined,
            installStage: 'pending_panels' as const,
          };
        }
      })
    );
  };

  const handleConfirmTentative = (jobId: string, type: 'posts' | 'panels') => {
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        
        if (type === 'posts' && job.tentativePostDate) {
          // Enforce 2-week guardrail
          if (job.tentativePostDate > twoWeeksFromNow) {
            console.warn('Cannot confirm: date is more than 2 weeks out');
            return job;
          }
          return {
            ...job,
            postInstallDate: job.tentativePostDate,
            tentativePostDate: undefined,
            installStage: 'posts_scheduled' as const,
          };
        } else if (type === 'panels' && job.tentativePanelDate) {
          // Enforce 2-week guardrail
          if (job.tentativePanelDate > twoWeeksFromNow) {
            console.warn('Cannot confirm: date is more than 2 weeks out');
            return job;
          }
          return {
            ...job,
            panelInstallDate: job.tentativePanelDate,
            tentativePanelDate: undefined,
            installStage: 'panels_scheduled' as const,
          };
        }
        return job;
      })
    );
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
              
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="sync-btn">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync ServiceM8
              </Button>
            </div>

            <TabsContent value="leads" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
               <PipelineBoard 
                  columns={pipelines.leads} 
                  jobs={filteredJobs} 
                  onJobMove={handleJobMove} 
               />
            </TabsContent>
            
            <TabsContent value="quotes" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
              <PipelineBoard 
                  columns={pipelines.quotes} 
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
            onUnscheduleJob={handleUnscheduleJob}
            onTentativeSchedule={handleTentativeSchedule}
            onUnscheduleTentative={handleUnscheduleTentative}
            onConfirmTentative={handleConfirmTentative}
          />
        )}
      </main>
    </div>
  );
}
