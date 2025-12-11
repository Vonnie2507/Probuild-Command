import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, Loader2 } from "lucide-react";
import type { WorkType, WorkTypeStage, JobStageProgress as JobStageProgressType } from "@shared/schema";

interface JobStageProgressProps {
  jobId: number;
  workTypeId?: number;
  compact?: boolean;
}

export function JobStageProgress({ jobId, workTypeId, compact = false }: JobStageProgressProps) {
  const queryClient = useQueryClient();

  const { data: workType } = useQuery<WorkType & { stages: WorkTypeStage[] }>({
    queryKey: ["/api/work-types", workTypeId],
    enabled: !!workTypeId,
  });

  const { data: stageProgress = [] } = useQuery<JobStageProgressType[]>({
    queryKey: ["/api/jobs", jobId, "stage-progress"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/stage-progress`);
      if (!res.ok) throw new Error("Failed to fetch stage progress");
      return res.json();
    },
    enabled: !!jobId,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({ stageId, status }: { stageId: number; status: string }) => {
      const res = await fetch(`/api/jobs/${jobId}/stage-progress/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update stage progress");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "stage-progress"] });
    },
  });

  const initializeStageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/initialize-stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workTypeId }),
      });
      if (!res.ok) throw new Error("Failed to initialize stages");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "stage-progress"] });
    },
  });

  if (!workTypeId) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No work type assigned
      </div>
    );
  }

  if (!workType) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading stages...
      </div>
    );
  }

  const stages = workType.stages || [];
  const progressMap = new Map(stageProgress.map(p => [p.stageId, p]));

  const getStageStatus = (stageId: number) => {
    return progressMap.get(stageId)?.status || 'pending';
  };

  const toggleStageStatus = (stageId: number) => {
    const currentStatus = getStageStatus(stageId);
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    updateProgressMutation.mutate({ stageId, status: newStatus });
  };

  const completedCount = stages.filter(s => getStageStatus(s.id) === 'completed').length;
  const totalCount = stages.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">
          {completedCount}/{totalCount}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
        <span className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn("h-5 text-[10px]", `bg-${workType.color}-50 text-${workType.color}-700 border-${workType.color}-200`)}>
            {workType.name}
          </Badge>
        </span>
        <span>{completedCount}/{totalCount} ({progressPercent}%)</span>
      </div>
      
      <div className="space-y-1.5">
        {stages.map((stage) => {
          const status = getStageStatus(stage.id);
          const isCompleted = status === 'completed';
          const isInProgress = status === 'in_progress';
          
          return (
            <div 
              key={stage.id} 
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
                isCompleted ? "bg-green-50 border border-green-100" : "bg-muted/30 hover:bg-muted/50 border border-transparent"
              )}
              onClick={() => toggleStageStatus(stage.id)}
              data-testid={`stage-${stage.id}`}
            >
              <div className={cn(
                "h-4 w-4 rounded-full flex items-center justify-center transition-colors shrink-0",
                isCompleted ? "bg-green-500 text-white" : isInProgress ? "bg-amber-500 text-white" : "border-2 border-muted-foreground/30"
              )}>
                {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                {isInProgress && <Clock className="h-2.5 w-2.5" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "text-xs font-medium",
                  isCompleted && "text-green-700 line-through"
                )}>
                  {stage.name}
                </span>
                <div className="flex gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1">{stage.category}</Badge>
                  {stage.triggersScheduler && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">Scheduler</Badge>}
                  {stage.triggersPurchaseOrder && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">PO</Badge>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {stages.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded">
          No stages defined for this work type
        </div>
      )}
    </div>
  );
}
