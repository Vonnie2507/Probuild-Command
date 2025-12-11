import { useState } from "react";
import { Job, PIPELINES, STAFF_MEMBERS } from "@/lib/mockData";
import { PipelineBoard } from "@/components/PipelineBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, CheckSquare, Package } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProductionDashboardProps {
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
}

export function ProductionDashboard({ jobs, onJobMove }: ProductionDashboardProps) {
  const [activeTimer, setActiveTimer] = useState<string | null>(null);

  const productionJobs = jobs.filter(j => 
    (j.lifecyclePhase === 'work_order' || j.status === 'work_order' || j.status === 'deposit_paid') &&
    j.status !== 'complete'
  );

  const toggleTimer = (jobId: string) => {
    if (activeTimer === jobId) {
      setActiveTimer(null);
    } else {
      setActiveTimer(jobId);
    }
  };

  return (
    <Tabs defaultValue="tasks" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tasks">Active Tasks</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Board</TabsTrigger>
          <TabsTrigger value="materials">Materials & POs</TabsTrigger>
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
            <Card key={job.id} className={cn("flex flex-col", activeTimer === job.id && "border-primary ring-1 ring-primary")}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold bg-muted px-1.5 py-0.5 rounded">{job.jobId}</span>
                      {job.urgency === 'critical' && <Badge variant="destructive" className="h-5 text-[10px]">URGENT</Badge>}
                    </div>
                    <CardTitle className="text-base leading-tight">{job.customerName}</CardTitle>
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
                {/* Task List */}
                <div className="space-y-2 bg-muted/30 p-2 rounded-md border border-border/50">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
                    <span>Task Checklist</span>
                    <span>{job.productionTasks.filter(t => t.completed).length}/{job.productionTasks.length}</span>
                  </div>
                  {job.productionTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2">
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center cursor-pointer transition-colors",
                        task.completed ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:border-primary"
                      )}>
                        {task.completed && <CheckSquare className="h-3 w-3" />}
                      </div>
                      <span className={cn("text-xs flex-1", task.completed && "text-muted-foreground line-through")}>
                        {task.name}
                      </span>
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-indigo-100 text-indigo-700">CW</AvatarFallback>
                      </Avatar>
                    </div>
                  ))}
                </div>

                {/* Assignment & Time Tracking */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Select defaultValue={job.assignedStaff}>
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue placeholder="Assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_MEMBERS.filter(s => s.role === 'production').map(staff => (
                          <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant={activeTimer === job.id ? "default" : "outline"}
                    className={cn(
                      "h-8 gap-2 transition-all",
                      activeTimer === job.id ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : ""
                    )}
                    onClick={() => toggleTimer(job.id)}
                  >
                    {activeTimer === job.id ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        <span className="font-mono">00:42:15</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Start</span>
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
