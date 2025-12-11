import { useState, useEffect, useCallback } from "react";
import { Job, PIPELINES } from "@/lib/mockData";
import { useSettings } from "@/lib/settingsContext";
import { PipelineBoard } from "@/components/PipelineBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, CheckSquare, Package, Loader2, Wrench } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WorkType {
  id: number;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
}

interface WorkTypeStage {
  id: number;
  workTypeId: number;
  name: string;
  key: string;
  orderIndex: number;
  category: string;
  description?: string;
}

interface StageProgress {
  id: number;
  jobId: number;
  stageId: number;
  status: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  timerRunning: boolean;
  timerStartedAt?: string;
  totalTimeSeconds: number;
}

interface ProductionDashboardProps {
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
}

interface TimerState {
  jobId: string;
  isRunning: boolean;
  startedAt: Date | null;
  totalSeconds: number;
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function ProductionDashboard({ jobs, onJobMove }: ProductionDashboardProps) {
  const { staff } = useSettings();
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [tick, setTick] = useState(0);
  const queryClient = useQueryClient();

  // Filter to only production and install staff
  const productionStaff = staff.filter(s => s.role === 'production' && s.active);
  const installStaff = staff.filter(s => s.role === 'install' && s.active);

  const productionJobs = jobs.filter(j => 
    (j.lifecyclePhase === 'work_order' || j.status === 'work_order' || j.status === 'deposit_paid') &&
    j.status !== 'complete'
  );
  
  // Fetch work types with their stages
  const { data: workTypesWithStages = {} } = useQuery<Record<number, { workType: WorkType; stages: WorkTypeStage[] }>>({
    queryKey: ["workTypesWithStages"],
    queryFn: async () => {
      const res = await fetch("/api/work-types");
      if (!res.ok) throw new Error("Failed to fetch work types");
      const workTypes: WorkType[] = await res.json();
      
      const result: Record<number, { workType: WorkType; stages: WorkTypeStage[] }> = {};
      
      for (const wt of workTypes) {
        const stagesRes = await fetch(`/api/work-types/${wt.id}/stages`);
        if (stagesRes.ok) {
          const stages: WorkTypeStage[] = await stagesRes.json();
          result[wt.id] = { workType: wt, stages: stages.sort((a, b) => a.orderIndex - b.orderIndex) };
        }
      }
      
      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
  
  // Fetch stage progress for all production jobs
  const { data: stageProgressMap = {} } = useQuery<Record<string, StageProgress[]>>({
    queryKey: ["stageProgress", productionJobs.map(j => j.id).join(",")],
    queryFn: async () => {
      const result: Record<string, StageProgress[]> = {};
      
      for (const job of productionJobs) {
        if (job.workTypeId) {
          const res = await fetch(`/api/jobs/${job.id}/stage-progress`);
          if (res.ok) {
            result[job.id] = await res.json();
          }
        }
      }
      
      return result;
    },
    staleTime: 30 * 1000,
  });
  
  // Mutation to update stage progress
  const updateStageMutation = useMutation({
    mutationFn: async ({ jobId, stageId, status }: { jobId: number; stageId: number; status: string }) => {
      const res = await fetch(`/api/jobs/${jobId}/stage-progress/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stageProgress"] });
    },
  });
  
  const toggleStageComplete = (jobId: number, stageId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    updateStageMutation.mutate({ jobId, stageId, status: newStatus });
  };
  
  const getStageStatus = (jobId: string, stageId: number): string => {
    const progress = stageProgressMap[jobId];
    if (!progress) return 'pending';
    const stage = progress.find(p => p.stageId === stageId);
    return stage?.status || 'pending';
  };
  
  const getCompletedStagesCount = (jobId: string, stages: WorkTypeStage[]): number => {
    const progress = stageProgressMap[jobId];
    if (!progress) return 0;
    return progress.filter(p => p.status === 'completed').length;
  };

  // Update tick every second to refresh running timers
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load timer states from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('production_timers');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert startedAt strings back to Date objects
        const restored: Record<string, TimerState> = {};
        for (const [jobId, timer] of Object.entries(parsed as Record<string, any>)) {
          restored[jobId] = {
            ...timer,
            startedAt: timer.startedAt ? new Date(timer.startedAt) : null
          };
        }
        setTimers(restored);
      }
    } catch (e) {
      console.error("Failed to load timers:", e);
    }
  }, []);

  // Save timer states to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('production_timers', JSON.stringify(timers));
    } catch (e) {
      console.error("Failed to save timers:", e);
    }
  }, [timers]);

  const getElapsedSeconds = useCallback((timer: TimerState): number => {
    let elapsed = timer.totalSeconds;
    if (timer.isRunning && timer.startedAt) {
      const now = new Date();
      elapsed += Math.floor((now.getTime() - timer.startedAt.getTime()) / 1000);
    }
    return elapsed;
  }, []);

  const toggleTimer = async (jobId: string, dbJobId: number) => {
    const currentTimer = timers[jobId];
    
    if (currentTimer?.isRunning) {
      // Stop the timer
      const elapsed = getElapsedSeconds(currentTimer);
      setTimers(prev => ({
        ...prev,
        [jobId]: {
          jobId,
          isRunning: false,
          startedAt: null,
          totalSeconds: elapsed
        }
      }));
      
      // Try to save to backend (for a generic job timer, use stageId = 0)
      try {
        await fetch(`/api/jobs/${dbJobId}/stages/0/timer/stop`, { method: 'POST' });
      } catch (e) {
        console.error("Failed to save timer to backend:", e);
      }
    } else {
      // Start the timer
      setTimers(prev => ({
        ...prev,
        [jobId]: {
          jobId,
          isRunning: true,
          startedAt: new Date(),
          totalSeconds: currentTimer?.totalSeconds || 0
        }
      }));
      
      // Try to save to backend
      try {
        await fetch(`/api/jobs/${dbJobId}/stages/0/timer/start`, { method: 'POST' });
      } catch (e) {
        console.error("Failed to save timer to backend:", e);
      }
    }
  };

  const getTimerDisplay = (jobId: string): string => {
    const timer = timers[jobId];
    if (!timer) return "00:00:00";
    return formatTime(getElapsedSeconds(timer));
  };

  const isTimerRunning = (jobId: string): boolean => {
    return timers[jobId]?.isRunning || false;
  };

  return (
    <Tabs defaultValue="tasks" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tasks" data-testid="tab-tasks">Active Tasks</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline Board</TabsTrigger>
          <TabsTrigger value="materials" data-testid="tab-materials">Materials & POs</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="pipeline" className="flex-1 overflow-hidden mt-0">
        <PipelineBoard 
          columns={PIPELINES.production} 
          jobs={productionJobs} 
          onJobMove={onJobMove} 
        />
      </TabsContent>

      <TabsContent value="tasks" className="flex-1 overflow-y-auto mt-0 pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {productionJobs.map(job => (
            <Card key={job.id} className={cn("flex flex-col", isTimerRunning(job.id) && "border-primary ring-1 ring-primary")}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold bg-muted px-1.5 py-0.5 rounded" data-testid={`job-id-${job.id}`}>{job.jobId}</span>
                      {job.urgency === 'critical' && <Badge variant="destructive" className="h-5 text-[10px]">URGENT</Badge>}
                    </div>
                    <CardTitle className="text-base leading-tight" data-testid={`customer-name-${job.id}`}>{job.customerName}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{job.address}</p>
                  </div>
                  {job.dueDate && (
                    <div className="text-right">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Due</div>
                      <div className="text-sm font-bold text-orange-600">{format(job.dueDate, "MMM d")}</div>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                {/* Work Type Badge */}
                {job.workTypeId && workTypesWithStages[job.workTypeId] && (
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs font-medium">
                      {workTypesWithStages[job.workTypeId].workType.name}
                    </Badge>
                  </div>
                )}
                
                {/* Task List - Show stages from work type */}
                <div className="space-y-2 bg-muted/30 p-2 rounded-md border border-border/50">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
                    <span>Production Tasks</span>
                    {job.workTypeId && workTypesWithStages[job.workTypeId] && (
                      <span>
                        {getCompletedStagesCount(job.id, workTypesWithStages[job.workTypeId].stages)}/
                        {workTypesWithStages[job.workTypeId].stages.length}
                      </span>
                    )}
                  </div>
                  
                  {!job.workTypeId ? (
                    <div className="text-xs text-muted-foreground italic py-2 flex items-center gap-2">
                      <Wrench className="h-3 w-3" />
                      No job type assigned - select one in the job card
                    </div>
                  ) : !workTypesWithStages[job.workTypeId] ? (
                    <div className="text-xs text-muted-foreground italic py-2 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading tasks...
                    </div>
                  ) : workTypesWithStages[job.workTypeId].stages.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic py-2">
                      No tasks configured for this job type
                    </div>
                  ) : (
                    workTypesWithStages[job.workTypeId].stages.map(stage => {
                      const status = getStageStatus(job.id, stage.id);
                      const isCompleted = status === 'completed';
                      
                      return (
                        <div key={stage.id} className="flex items-center gap-2">
                          <div 
                            className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center cursor-pointer transition-colors",
                              isCompleted ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:border-primary"
                            )}
                            onClick={() => toggleStageComplete(parseInt(job.id), stage.id, status)}
                            data-testid={`stage-checkbox-${job.id}-${stage.id}`}
                          >
                            {isCompleted && <CheckSquare className="h-3 w-3" />}
                          </div>
                          <span className={cn("text-xs flex-1", isCompleted && "text-muted-foreground line-through")}>
                            {stage.name}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">
                            {stage.category}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Assignment & Time Tracking */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Select defaultValue={job.assignedStaff}>
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue placeholder="Assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {productionStaff.length > 0 ? (
                          productionStaff.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="unassigned">No production staff</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant={isTimerRunning(job.id) ? "default" : "outline"}
                    className={cn(
                      "h-8 gap-2 transition-all",
                      isTimerRunning(job.id) ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : ""
                    )}
                    onClick={() => toggleTimer(job.id, typeof job.id === 'string' ? parseInt(job.id) || 0 : job.id)}
                    data-testid={`timer-button-${job.id}`}
                  >
                    {isTimerRunning(job.id) ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        <span className="font-mono" data-testid={`timer-display-${job.id}`}>{getTimerDisplay(job.id)}</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>{timers[job.id]?.totalSeconds ? formatTime(timers[job.id].totalSeconds) : "Start"}</span>
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="materials" className="flex-1 overflow-y-auto mt-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Purchase Orders & Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {productionJobs.map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{job.jobId} - {job.customerName}</div>
                      <div className="text-xs text-muted-foreground">PO Required: White PVC Posts x 25, Caps x 25</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                     <Select defaultValue={job.purchaseOrderStatus}>
                      <SelectTrigger className={cn(
                        "w-[140px] h-8 text-xs font-medium border-0 ring-1 ring-inset",
                        job.purchaseOrderStatus === 'ordered' && "bg-blue-50 text-blue-700 ring-blue-200",
                        job.purchaseOrderStatus === 'received' && "bg-green-50 text-green-700 ring-green-200",
                        job.purchaseOrderStatus === 'delayed' && "bg-red-50 text-red-700 ring-red-200",
                        job.purchaseOrderStatus === 'none' && "bg-gray-50 text-gray-600 ring-gray-200",
                      )}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not Ordered</SelectItem>
                        <SelectItem value="ordered">Ordered</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="delayed">Delayed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
