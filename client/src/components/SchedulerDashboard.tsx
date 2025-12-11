import { useState } from "react";
import { Job, SCHEDULER_COLUMNS } from "@/lib/mockData";
import { useSettings } from "@/lib/settingsContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, MapPin, Truck, Factory, Users, Clock, GripVertical, X, CalendarDays, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, differenceInDays, isAfter, addWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface SchedulerDashboardProps {
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
  onScheduleJob?: (jobId: string, type: 'posts' | 'panels', date: Date) => void;
  onUnscheduleJob?: (jobId: string, type: 'posts' | 'panels') => void;
  onTentativeSchedule?: (jobId: string, type: 'posts' | 'panels', date: Date) => void;
  onUnscheduleTentative?: (jobId: string, type: 'posts' | 'panels') => void;
  onConfirmTentative?: (jobId: string, type: 'posts' | 'panels') => void;
  onSchedulerStageChange?: (jobId: string, newStage: string) => void;
}

type SchedulerView = 'alljobs' | 'tentative' | 'install';

export function SchedulerDashboard({ 
  jobs, 
  onScheduleJob, 
  onUnscheduleJob,
  onTentativeSchedule,
  onUnscheduleTentative,
  onConfirmTentative,
  onSchedulerStageChange
}: SchedulerDashboardProps) {
  const { staff, pipelines, getDailyInstallCapacity } = useSettings();
  const [schedulerView, setSchedulerView] = useState<SchedulerView>('alljobs');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tentativeSelectedDate, setTentativeSelectedDate] = useState<Date>(addWeeks(new Date(), 2));
  const [scheduleModal, setScheduleModal] = useState<{
    open: boolean;
    job: Job | null;
    type: 'posts' | 'panels';
    isTentative: boolean;
  }>({ open: false, job: null, type: 'posts', isTentative: false });
  
  // 2-week lockout for confirmed scheduling
  const twoWeeksFromNow = addDays(new Date(), 14);
  
  // Capacity Logic
  const dailyTotalHours = getDailyInstallCapacity();
  const installStaff = staff.filter(s => s.role === 'install' && s.active && s.id !== 'all');
  const availableTeams = Math.ceil(installStaff.length / 2);

  // Mock Production Capacity (Next 6 Weeks)
  const productionCapacity = [
    { week: "This Week", load: 95, color: "bg-red-500" },
    { week: "+1 Week", load: 80, color: "bg-orange-500" },
    { week: "+2 Weeks", load: 60, color: "bg-yellow-500" },
    { week: "+3 Weeks", load: 40, color: "bg-green-500" },
    { week: "+4 Weeks", load: 20, color: "bg-green-500" },
    { week: "+5 Weeks", load: 10, color: "bg-green-500" },
  ];

  // Queues
  const pendingPostInstall = jobs.filter(j => j.installStage === 'pending_posts' && pipelines.production.some(p => p.id === j.status));
  const pendingPanelInstall = jobs.filter(j => j.installStage === 'pending_panels');
  
  // Calendar Logic
  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: startDate, end: endDate });

  // Get next 4 weeks of available dates for scheduling modal
  const getSchedulableDates = () => {
    const dates: Date[] = [];
    for (let i = 0; i < 28; i++) {
      const date = addDays(new Date(), i);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        dates.push(date);
      }
    }
    return dates;
  };

  const handleJobClick = (job: Job, type: 'posts' | 'panels', isTentative: boolean = false) => {
    setScheduleModal({ open: true, job, type, isTentative });
  };

  const handleSchedule = (date: Date) => {
    if (scheduleModal.job) {
      if (scheduleModal.isTentative && onTentativeSchedule) {
        onTentativeSchedule(scheduleModal.job.id, scheduleModal.type, date);
      } else if (onScheduleJob) {
        onScheduleJob(scheduleModal.job.id, scheduleModal.type, date);
      }
    }
    setScheduleModal({ open: false, job: null, type: 'posts', isTentative: false });
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    
    if (!destination) return;
    
    // Check if this is a tentative drag
    const isTentativeDrag = draggableId.startsWith('tentative-');
    const cleanDraggableId = isTentativeDrag ? draggableId.replace('tentative-', '') : draggableId;
    
    // Parse the draggable ID to get job ID and type
    const [jobId, type] = cleanDraggableId.split('::');
    
    // Check if dropped on tentative calendar day
    if (destination.droppableId.startsWith('tentative-calendar-')) {
      const dateStr = destination.droppableId.replace('tentative-calendar-', '');
      const date = parseISO(dateStr);
      
      if (onTentativeSchedule) {
        onTentativeSchedule(jobId, type as 'posts' | 'panels', date);
      }
      return;
    }
    
    // Check if dropped back to tentative queue (unscheduling tentative)
    if (destination.droppableId === 'tentative-queue') {
      if (onUnscheduleTentative) {
        onUnscheduleTentative(jobId, type as 'posts' | 'panels');
      }
      return;
    }
    
    // Check if dropped on a confirmed calendar day (scheduling)
    if (destination.droppableId.startsWith('calendar-')) {
      const dateStr = destination.droppableId.replace('calendar-', '');
      const date = parseISO(dateStr);
      
      // Enforce 2-week guardrail for confirmed scheduling
      const daysUntil = differenceInDays(date, new Date());
      if (daysUntil > 14) {
        console.warn('Cannot schedule confirmed install more than 2 weeks out');
        return;
      }
      
      // If this was a tentative job being confirmed, clear tentative state first
      if (isTentativeDrag && onUnscheduleTentative) {
        onUnscheduleTentative(jobId, type as 'posts' | 'panels');
      }
      
      if (onScheduleJob) {
        onScheduleJob(jobId, type as 'posts' | 'panels', date);
      }
    }
    
    // Check if dropped back to staging queue (unscheduling)
    if (destination.droppableId === 'posts-queue' && type === 'posts') {
      if (onUnscheduleJob) {
        onUnscheduleJob(jobId, 'posts');
      }
    }
    if (destination.droppableId === 'panels-queue' && type === 'panels') {
      if (onUnscheduleJob) {
        onUnscheduleJob(jobId, 'panels');
      }
    }
  };

  const handleUnscheduleClick = (jobId: string, type: 'posts' | 'panels', e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUnscheduleJob) {
      onUnscheduleJob(jobId, type);
    }
  };

  const schedulableDates = getSchedulableDates();

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col gap-4 overflow-hidden">
        
        {/* Schedule Modal */}
        <Dialog open={scheduleModal.open} onOpenChange={(open) => setScheduleModal({ ...scheduleModal, open })}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Schedule {scheduleModal.type === 'posts' ? 'Post Installation' : 'Panel Installation'}
              </DialogTitle>
              <DialogDescription>
                {scheduleModal.job && (
                  <span className="font-medium">{scheduleModal.job.jobId} - {scheduleModal.job.customerName}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {scheduleModal.job && (
              <div className="space-y-4">
                <div className="bg-muted/30 border rounded p-3 text-sm">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {scheduleModal.type === 'posts' 
                          ? scheduleModal.job.postInstallDuration 
                          : scheduleModal.job.panelInstallDuration}h
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {scheduleModal.type === 'posts' 
                          ? scheduleModal.job.postInstallCrewSize 
                          : scheduleModal.job.panelInstallCrewSize} Staff
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {scheduleModal.job.address}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 text-sm">Select Installation Date</h4>
                  <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                    {schedulableDates.map(date => {
                      const postJobs = jobs.filter(j => j.postInstallDate && isSameDay(j.postInstallDate, date));
                      const panelJobs = jobs.filter(j => j.panelInstallDate && isSameDay(j.panelInstallDate, date));
                      const totalBookedHours = 
                        postJobs.reduce((sum, j) => sum + j.postInstallDuration, 0) + 
                        panelJobs.reduce((sum, j) => sum + j.panelInstallDuration, 0);
                      const capacityPercent = Math.round((totalBookedHours / dailyTotalHours) * 100);
                      const isOverCapacity = totalBookedHours > dailyTotalHours;
                      const jobDuration = scheduleModal.type === 'posts' 
                        ? scheduleModal.job!.postInstallDuration 
                        : scheduleModal.job!.panelInstallDuration;
                      const wouldOverbook = (totalBookedHours + jobDuration) > dailyTotalHours;

                      return (
                        <button
                          key={date.toString()}
                          onClick={() => handleSchedule(date)}
                          data-testid={`schedule-date-${format(date, 'yyyy-MM-dd')}`}
                          className={cn(
                            "p-2 border rounded text-center hover:border-primary hover:bg-primary/5 transition-colors",
                            isOverCapacity && "border-red-300 bg-red-50",
                            wouldOverbook && !isOverCapacity && "border-orange-300 bg-orange-50",
                            isSameDay(date, new Date()) && "ring-2 ring-primary"
                          )}
                        >
                          <div className="font-medium text-sm">{format(date, "EEE")}</div>
                          <div className="text-lg font-bold">{format(date, "d")}</div>
                          <div className="text-[10px] text-muted-foreground">{format(date, "MMM")}</div>
                          <div className={cn(
                            "mt-1 text-[9px] font-mono",
                            isOverCapacity ? "text-red-600 font-bold" : capacityPercent > 80 ? "text-orange-600" : "text-green-600"
                          )}>
                            {totalBookedHours}/{dailyTotalHours}h
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleModal({ open: false, job: null, type: 'posts', isTentative: false })}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Toggle */}
        <div className="shrink-0 flex items-center justify-between bg-card border rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-semibold">Schedule Management</h2>
          </div>
          <div className="flex bg-muted p-1 rounded-md">
            <button
              onClick={() => setSchedulerView('alljobs')}
              data-testid="view-alljobs"
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all flex items-center gap-2",
                schedulerView === 'alljobs' 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Briefcase className="h-3.5 w-3.5" />
              All Jobs
            </button>
            <button
              onClick={() => setSchedulerView('tentative')}
              data-testid="view-tentative"
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all flex items-center gap-2",
                schedulerView === 'tentative' 
                  ? "bg-white text-orange-600 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Tentative Planner
            </button>
            <button
              onClick={() => setSchedulerView('install')}
              data-testid="view-install"
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-sm transition-all flex items-center gap-2",
                schedulerView === 'install' 
                  ? "bg-white text-green-600 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Install Calendar
              <Badge variant="outline" className="text-[9px] ml-1">2-Week Lock</Badge>
            </button>
          </div>
        </div>

        {/* 1. Production Capabilities Timeline */}
        <div className="shrink-0 bg-card border rounded-lg p-3 shadow-sm grid grid-cols-[300px_1fr] gap-6">
          {/* Left: Staff Capacity Summary */}
          <div className="border-r pr-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="font-heading text-sm font-semibold uppercase tracking-wide">Install Capability</h3>
              </div>
              <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Daily Capacity</span>
                  <span className="text-sm font-bold">{dailyTotalHours} Hours</span>
              </div>
               <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Active Teams</span>
                  <span className="text-sm font-bold">{availableTeams} Teams</span>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground flex gap-1 flex-wrap">
                  {installStaff.map(s => (
                      <span key={s.id} className={cn("px-1.5 py-0.5 rounded text-white", s.color)}>{s.name.split(' ')[0]}</span>
                  ))}
              </div>
          </div>

          {/* Right: Production Forecast */}
          <div>
              <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  <h3 className="font-heading text-sm font-semibold uppercase tracking-wide">Production Capacity Forecast</h3>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-4">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Critical</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> Heavy</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Open</span>
              </div>
              </div>
              <div className="grid grid-cols-6 gap-2">
              {productionCapacity.map((cap, i) => (
                  <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                      <span>{cap.week}</span>
                      <span>{cap.load}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                      className={cn("h-full rounded-full", cap.color)} 
                      style={{ width: `${cap.load}%` }}
                      />
                  </div>
                  </div>
              ))}
              </div>
          </div>
        </div>

        {/* ALL JOBS KANBAN VIEW */}
        {schedulerView === 'alljobs' && (
          <DragDropContext onDragEnd={(result) => {
            if (!result.destination || !onSchedulerStageChange) return;
            const jobId = result.draggableId.replace('kanban-', '');
            const newStage = result.destination.droppableId;
            onSchedulerStageChange(jobId, newStage);
          }}>
            <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
              {SCHEDULER_COLUMNS.map((column) => {
                const columnJobs = jobs.filter(j => j.lifecyclePhase === 'work_order' && j.schedulerStage === column.id);
                return (
                  <div key={column.id} className="flex-1 min-w-[220px] max-w-[280px]">
                    <Card className="h-full flex flex-col border-t-4 border-t-blue-500">
                      <CardHeader className="p-3 pb-2 shrink-0">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-sm font-bold">{column.title}</CardTitle>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">{columnJobs.length}</Badge>
                        </div>
                      </CardHeader>
                      <Droppable droppableId={column.id}>
                        {(provided, snapshot) => (
                          <CardContent 
                            className={cn("p-2 flex-1 overflow-y-auto space-y-2", snapshot.isDraggingOver && "bg-blue-50")}
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                          >
                            {columnJobs.map((job, index) => (
                              <Draggable key={job.id} draggableId={`kanban-${job.id}`} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    data-testid={`kanban-job-${job.id}`}
                                    className={cn(
                                      "bg-white border-l-4 border-l-blue-500 border rounded p-2 text-xs shadow-sm hover:shadow-md transition-shadow cursor-grab",
                                      snapshot.isDragging && "shadow-lg ring-2 ring-blue-400"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-bold text-blue-700">{job.jobId}</span>
                                      <span className="text-muted-foreground ml-auto">${job.quoteValue.toLocaleString()}</span>
                                    </div>
                                    <div className="font-medium truncate mb-1">{job.customerName}</div>
                                    <div className="text-muted-foreground flex items-center gap-1 truncate">
                                      <MapPin className="h-3 w-3 shrink-0" /> 
                                      <span className="truncate">{job.address.split('\n')[0]}</span>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {columnJobs.length === 0 && (
                              <div className="text-center text-xs text-muted-foreground py-8">
                                No jobs
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Droppable>
                    </Card>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}

        {/* INSTALL CALENDAR VIEW */}
        {schedulerView === 'install' && (
        <div className="flex flex-1 gap-6 overflow-hidden">
          
          {/* 2. Staging Lanes (The "To-Do" List for Scheduler) */}
          <div className="w-80 flex flex-col gap-4 shrink-0 overflow-y-auto pr-1">
            {/* Post Install Queue */}
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="p-3 pb-1">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</div>
                    Schedule Posts
                  </CardTitle>
                  <Badge variant="secondary">{pendingPostInstall.length}</Badge>
                </div>
              </CardHeader>
              <Droppable droppableId="posts-queue">
                {(provided, snapshot) => (
                  <CardContent 
                    className={cn("p-3 space-y-2 min-h-[100px]", snapshot.isDraggingOver && "bg-blue-50")}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {pendingPostInstall.map((job, index) => (
                      <Draggable key={job.id} draggableId={`${job.id}::posts`} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onClick={() => handleJobClick(job, 'posts')}
                            data-testid={`schedule-posts-${job.id}`}
                            className={cn(
                              "bg-muted/30 border rounded p-2 text-xs hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer group",
                              snapshot.isDragging && "shadow-lg ring-2 ring-blue-400 bg-blue-50"
                            )}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-muted rounded">
                                <GripVertical className="h-3 w-3 text-muted-foreground" />
                              </div>
                              <span className="font-bold">{job.jobId}</span>
                              <span className="text-muted-foreground font-normal ml-auto">{job.estimatedProductionDuration}d prod</span>
                            </div>
                            <div className="text-sm font-medium mb-2">{job.customerName}</div>
                            
                            {/* Estimation Badge */}
                            <div className="flex items-center gap-2 bg-white border rounded px-1.5 py-1 mb-1 shadow-sm">
                              <Clock className="h-3 w-3 text-blue-600" />
                              <span className="font-bold text-blue-700">{job.postInstallDuration}h</span>
                              <span className="text-muted-foreground mx-0.5">•</span>
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{job.postInstallCrewSize} Staff</span>
                            </div>

                            <div className="text-muted-foreground flex items-center gap-1 mt-1 truncate">
                              <MapPin className="h-3 w-3" /> {job.address.split(',')[0]}
                            </div>
                            
                            <div className="mt-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] text-blue-600 font-medium">Drag to calendar or click →</span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {pendingPostInstall.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">No jobs waiting for posts</div>}
                  </CardContent>
                )}
              </Droppable>
            </Card>

            {/* Panel Install Queue */}
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="p-3 pb-1">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs">2</div>
                    Schedule Panels
                  </CardTitle>
                  <Badge variant="secondary">{pendingPanelInstall.length}</Badge>
                </div>
              </CardHeader>
              <Droppable droppableId="panels-queue">
                {(provided, snapshot) => (
                  <CardContent 
                    className={cn("p-3 space-y-2 min-h-[100px]", snapshot.isDraggingOver && "bg-purple-50")}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {pendingPanelInstall.map((job, index) => (
                      <Draggable key={job.id} draggableId={`${job.id}::panels`} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onClick={() => handleJobClick(job, 'panels')}
                            data-testid={`schedule-panels-${job.id}`}
                            className={cn(
                              "bg-muted/30 border rounded p-2 text-xs hover:bg-purple-50 hover:border-purple-300 transition-colors cursor-pointer group",
                              snapshot.isDragging && "shadow-lg ring-2 ring-purple-400 bg-purple-50"
                            )}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-muted rounded">
                                <GripVertical className="h-3 w-3 text-muted-foreground" />
                              </div>
                              <span className="font-bold">{job.jobId}</span>
                              <Badge variant="outline" className="h-4 px-1 text-[9px] border-green-200 text-green-700 bg-green-50 ml-auto">Posts In</Badge>
                            </div>
                            <div className="text-sm font-medium mb-2">{job.customerName}</div>

                            {/* Estimation Badge */}
                            <div className="flex items-center gap-2 bg-white border rounded px-1.5 py-1 mb-1 shadow-sm">
                              <Clock className="h-3 w-3 text-purple-600" />
                              <span className="font-bold text-purple-700">{job.panelInstallDuration}h</span>
                              <span className="text-muted-foreground mx-0.5">•</span>
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{job.panelInstallCrewSize} Staff</span>
                            </div>

                            <div className="text-muted-foreground flex items-center gap-1 mt-1 truncate">
                              <MapPin className="h-3 w-3" /> {job.address.split(',')[0]}
                            </div>
                            
                            <div className="mt-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] text-purple-600 font-medium">Drag to calendar or click →</span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {pendingPanelInstall.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">No panels ready for install</div>}
                  </CardContent>
                )}
              </Droppable>
            </Card>
          </div>

          {/* 3. Install Calendar */}
          <div className="flex-1 flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-heading font-semibold text-lg">Installation Schedule</h3>
                <Badge variant="outline" className="text-[10px] ml-2">Drop jobs here</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -7))} data-testid="prev-week-btn">Prev Week</Button>
                <span className="font-mono font-medium text-sm w-32 text-center">
                  {format(startDate, "MMM d")} - {format(endDate, "MMM d")}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 7))} data-testid="next-week-btn">Next Week</Button>
              </div>
            </div>

            <div className="grid grid-cols-5 flex-1 divide-x divide-border overflow-hidden">
              {weekDays.slice(0, 5).map(day => {
                const isToday = isSameDay(day, new Date());
                const postJobs = jobs.filter(j => j.postInstallDate && isSameDay(j.postInstallDate, day));
                const panelJobs = jobs.filter(j => j.panelInstallDate && isSameDay(j.panelInstallDate, day));
                const dateStr = format(day, 'yyyy-MM-dd');
                
                // Calculate Daily Load
                const totalBookedHours = 
                  postJobs.reduce((sum, j) => sum + j.postInstallDuration, 0) + 
                  panelJobs.reduce((sum, j) => sum + j.panelInstallDuration, 0);
                
                const capacityPercent = Math.min(100, Math.round((totalBookedHours / dailyTotalHours) * 100));
                const isOverCapacity = totalBookedHours > dailyTotalHours;

                return (
                  <Droppable key={day.toString()} droppableId={`calendar-${dateStr}`}>
                    {(provided, snapshot) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex flex-col h-full",
                          isToday && "bg-primary/5",
                          snapshot.isDraggingOver && "bg-green-50 ring-2 ring-inset ring-green-400"
                        )}
                      >
                        <div className={cn("p-2 text-center border-b font-medium text-sm", isToday && "text-primary font-bold")}>
                          {format(day, "EEE d")}
                          <div className="mt-1.5 flex items-center gap-1.5 justify-center">
                             <div className={cn("h-1.5 w-16 rounded-full overflow-hidden", isOverCapacity ? "bg-red-100" : "bg-muted")}>
                               <div className={cn("h-full transition-all", isOverCapacity ? "bg-red-500" : capacityPercent > 80 ? "bg-orange-500" : "bg-green-500")} style={{ width: `${capacityPercent}%` }} />
                             </div>
                             <span className={cn("text-[9px] font-mono", isOverCapacity ? "text-red-600 font-bold" : "text-muted-foreground")}>{totalBookedHours}h</span>
                          </div>
                        </div>
                        <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-[100px]">
                          
                          {/* Post Installs - Draggable */}
                          {postJobs.map((job, index) => (
                            <Draggable key={`cal-post-${job.id}`} draggableId={`${job.id}::posts`} index={index}>
                              {(provided, snapshot) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    "bg-blue-50 border border-blue-200 rounded p-2 text-xs shadow-sm hover:border-blue-400 cursor-grab active:cursor-grabbing group relative overflow-hidden",
                                    snapshot.isDragging && "shadow-lg ring-2 ring-blue-400"
                                  )}
                                >
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                                  
                                  <button 
                                    onClick={(e) => handleUnscheduleClick(job.id, 'posts', e)}
                                    className="absolute right-1 top-1 p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`unschedule-posts-${job.id}`}
                                  >
                                    <X className="h-3 w-3 text-red-500" />
                                  </button>
                                  
                                  <div className="flex items-center justify-between mb-1 pl-2 pr-4">
                                    <span className="font-bold text-blue-700">POSTS</span>
                                    <span className="text-[9px] font-mono font-bold bg-white px-1 rounded border border-blue-100 text-blue-600">{job.postInstallDuration}h</span>
                                  </div>
                                  <div className="font-medium text-foreground mb-0.5 pl-2">{job.customerName}</div>
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-2">
                                    <Truck className="h-3 w-3" /> Team A ({job.postInstallCrewSize} Pax)
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}

                          {/* Panel Installs - Draggable */}
                          {panelJobs.map((job, index) => (
                            <Draggable key={`cal-panel-${job.id}`} draggableId={`${job.id}::panels`} index={postJobs.length + index}>
                              {(provided, snapshot) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    "bg-purple-50 border border-purple-200 rounded p-2 text-xs shadow-sm hover:border-purple-400 cursor-grab active:cursor-grabbing group relative overflow-hidden",
                                    snapshot.isDragging && "shadow-lg ring-2 ring-purple-400"
                                  )}
                                >
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500"></div>

                                  <button 
                                    onClick={(e) => handleUnscheduleClick(job.id, 'panels', e)}
                                    className="absolute right-1 top-1 p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`unschedule-panels-${job.id}`}
                                  >
                                    <X className="h-3 w-3 text-red-500" />
                                  </button>

                                  <div className="flex items-center justify-between mb-1 pl-2 pr-4">
                                    <span className="font-bold text-purple-700">PANELS</span>
                                    <span className="text-[9px] font-mono font-bold bg-white px-1 rounded border border-purple-100 text-purple-600">{job.panelInstallDuration}h</span>
                                  </div>
                                  <div className="font-medium text-foreground mb-0.5 pl-2">{job.customerName}</div>
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-2">
                                    <Truck className="h-3 w-3" /> Team B ({job.panelInstallCrewSize} Pax)
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          
                          {provided.placeholder}
                          
                          {/* Empty state / Drop zone indicator */}
                          {postJobs.length === 0 && panelJobs.length === 0 && !snapshot.isDraggingOver && (
                            <div className="border border-dashed border-border rounded p-2 flex items-center justify-center text-muted-foreground opacity-50 h-full min-h-[60px]">
                              <span className="text-[10px]">Drop here</span>
                            </div>
                          )}
                          
                          {snapshot.isDraggingOver && (
                            <div className="border-2 border-dashed border-green-400 rounded p-3 flex items-center justify-center bg-green-100/50">
                              <span className="text-xs text-green-700 font-medium">Drop to schedule</span>
                            </div>
                          )}

                        </div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>
        </div>
        )}

        {/* TENTATIVE PLANNER VIEW */}
        {schedulerView === 'tentative' && (
          <TentativePlannerView 
            jobs={jobs}
            tentativeSelectedDate={tentativeSelectedDate}
            setTentativeSelectedDate={setTentativeSelectedDate}
            onTentativeSchedule={onTentativeSchedule}
            onUnscheduleTentative={onUnscheduleTentative}
            onConfirmTentative={onConfirmTentative}
            twoWeeksFromNow={twoWeeksFromNow}
            dailyTotalHours={dailyTotalHours}
          />
        )}
      </div>
    </DragDropContext>
  );
}

// Tentative Planner Sub-Component
function TentativePlannerView({ 
  jobs, 
  tentativeSelectedDate, 
  setTentativeSelectedDate,
  onTentativeSchedule,
  onUnscheduleTentative,
  onConfirmTentative,
  twoWeeksFromNow,
  dailyTotalHours
}: {
  jobs: Job[];
  tentativeSelectedDate: Date;
  setTentativeSelectedDate: (date: Date) => void;
  onTentativeSchedule?: (jobId: string, type: 'posts' | 'panels', date: Date) => void;
  onUnscheduleTentative?: (jobId: string, type: 'posts' | 'panels') => void;
  onConfirmTentative?: (jobId: string, type: 'posts' | 'panels') => void;
  twoWeeksFromNow: Date;
  dailyTotalHours: number;
}) {
  // Jobs that can be tentatively scheduled (all jobs, even early stage)
  const unscheduledJobs = jobs.filter(j => 
    !j.tentativePostDate && 
    !j.postInstallDate && 
    j.installStage !== 'completed'
  );
  
  // Jobs with tentative bookings
  const tentativeJobs = jobs.filter(j => j.tentativePostDate || j.tentativePanelDate);
  
  // Calendar weeks (6 weeks out)
  const startDate = startOfWeek(tentativeSelectedDate, { weekStartsOn: 1 });
  const endDate = endOfWeek(tentativeSelectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: startDate, end: endDate });

  const handleConfirmClick = (jobId: string, type: 'posts' | 'panels', date: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    const daysUntil = differenceInDays(date, new Date());
    if (daysUntil <= 14 && onConfirmTentative) {
      onConfirmTentative(jobId, type);
    }
  };

  const handleRemoveTentative = (jobId: string, type: 'posts' | 'panels', e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUnscheduleTentative) {
      onUnscheduleTentative(jobId, type);
    }
  };

  return (
    <div className="flex flex-1 gap-6 overflow-hidden">
      {/* Jobs Available for Tentative Booking */}
      <div className="w-80 flex flex-col gap-4 shrink-0 overflow-y-auto pr-1">
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="p-3 pb-1">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-orange-600" />
                Available Jobs
              </CardTitle>
              <Badge variant="secondary">{unscheduledJobs.length}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Drag jobs to plan tentative dates</p>
          </CardHeader>
          <Droppable droppableId="tentative-queue">
            {(provided, snapshot) => (
              <CardContent 
                className={cn("p-3 space-y-2 min-h-[200px]", snapshot.isDraggingOver && "bg-orange-50")}
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {unscheduledJobs.slice(0, 15).map((job, index) => (
                  <Draggable key={job.id} draggableId={`tentative-${job.id}::posts`} index={index}>
                    {(provided, snapshot) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        data-testid={`tentative-job-${job.id}`}
                        className={cn(
                          "bg-muted/30 border rounded p-2 text-xs hover:bg-orange-50 hover:border-orange-300 transition-colors cursor-grab group",
                          snapshot.isDragging && "shadow-lg ring-2 ring-orange-400 bg-orange-50"
                        )}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                          <span className="font-bold">{job.jobId}</span>
                          <Badge variant="outline" className="h-4 px-1 text-[9px] ml-auto">{job.status}</Badge>
                        </div>
                        <div className="text-sm font-medium">{job.customerName}</div>
                        <div className="text-muted-foreground flex items-center gap-1 mt-1 truncate">
                          <MapPin className="h-3 w-3" /> {job.address.split(',')[0]}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[10px]">
                          <span className="text-blue-600 font-medium">Posts: {job.postInstallDuration}h</span>
                          <span className="text-purple-600 font-medium">Panels: {job.panelInstallDuration}h</span>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {unscheduledJobs.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-4">All jobs have tentative dates</div>
                )}
              </CardContent>
            )}
          </Droppable>
        </Card>

        {/* Tentative Summary */}
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Tentative Bookings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tentative:</span>
              <span className="font-bold">{tentativeJobs.length} jobs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ready to Confirm:</span>
              <span className="font-bold text-green-600">
                {tentativeJobs.filter(j => 
                  (j.tentativePostDate && differenceInDays(j.tentativePostDate, new Date()) <= 14) ||
                  (j.tentativePanelDate && differenceInDays(j.tentativePanelDate, new Date()) <= 14)
                ).length} jobs
              </span>
            </div>
            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-orange-700">
              Jobs can be confirmed when within 2 weeks of install date
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tentative Calendar */}
      <div className="flex-1 flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-orange-50/50">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-orange-600" />
            <h3 className="font-heading font-semibold text-lg">Tentative Schedule</h3>
            <Badge variant="outline" className="text-[10px] ml-2 border-orange-300 text-orange-700">Planning View</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTentativeSelectedDate(addDays(tentativeSelectedDate, -7))} data-testid="tent-prev-week">Prev Week</Button>
            <span className="font-mono font-medium text-sm w-32 text-center">
              {format(startDate, "MMM d")} - {format(endDate, "MMM d")}
            </span>
            <Button variant="outline" size="sm" onClick={() => setTentativeSelectedDate(addDays(tentativeSelectedDate, 7))} data-testid="tent-next-week">Next Week</Button>
          </div>
        </div>

        <div className="grid grid-cols-5 flex-1 divide-x divide-border overflow-hidden">
          {weekDays.slice(0, 5).map(day => {
            const isWithin2Weeks = differenceInDays(day, new Date()) <= 14 && differenceInDays(day, new Date()) >= 0;
            const tentativePostsOnDay = jobs.filter(j => j.tentativePostDate && isSameDay(j.tentativePostDate, day));
            const tentativePanelsOnDay = jobs.filter(j => j.tentativePanelDate && isSameDay(j.tentativePanelDate, day));
            const dateStr = format(day, 'yyyy-MM-dd');
            
            const totalTentativeHours = 
              tentativePostsOnDay.reduce((sum, j) => sum + j.postInstallDuration, 0) + 
              tentativePanelsOnDay.reduce((sum, j) => sum + j.panelInstallDuration, 0);

            return (
              <Droppable key={day.toString()} droppableId={`tentative-calendar-${dateStr}`}>
                {(provided, snapshot) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex flex-col h-full",
                      isWithin2Weeks && "bg-green-50/50",
                      snapshot.isDraggingOver && "bg-orange-50 ring-2 ring-inset ring-orange-400"
                    )}
                  >
                    <div className={cn("p-2 text-center border-b font-medium text-sm", isWithin2Weeks && "bg-green-100/50")}>
                      {format(day, "EEE d")}
                      {isWithin2Weeks && (
                        <Badge variant="outline" className="ml-1 text-[8px] h-4 border-green-300 text-green-700">Can Confirm</Badge>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {totalTentativeHours}h tentative
                      </div>
                    </div>
                    <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-[100px]">
                      
                      {/* Tentative Post Installs */}
                      {tentativePostsOnDay.map(job => (
                        <div key={`tent-post-${job.id}`} className="bg-orange-50 border border-orange-200 rounded p-2 text-xs shadow-sm group relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400"></div>
                          
                          <button 
                            onClick={(e) => handleRemoveTentative(job.id, 'posts', e)}
                            className="absolute right-1 top-1 p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3 text-red-500" />
                          </button>
                          
                          <div className="flex items-center justify-between mb-1 pl-2 pr-4">
                            <span className="font-bold text-orange-700">POSTS (T)</span>
                            <span className="text-[9px] font-mono font-bold">{job.postInstallDuration}h</span>
                          </div>
                          <div className="font-medium text-foreground mb-1 pl-2">{job.customerName}</div>
                          
                          {isWithin2Weeks && job.tentativePostDate && (
                            <button 
                              onClick={(e) => handleConfirmClick(job.id, 'posts', job.tentativePostDate!, e)}
                              className="w-full mt-1 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[10px] font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Confirm
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Tentative Panel Installs */}
                      {tentativePanelsOnDay.map(job => (
                        <div key={`tent-panel-${job.id}`} className="bg-orange-50 border border-orange-200 rounded p-2 text-xs shadow-sm group relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400"></div>

                          <button 
                            onClick={(e) => handleRemoveTentative(job.id, 'panels', e)}
                            className="absolute right-1 top-1 p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3 text-red-500" />
                          </button>

                          <div className="flex items-center justify-between mb-1 pl-2 pr-4">
                            <span className="font-bold text-orange-700">PANELS (T)</span>
                            <span className="text-[9px] font-mono font-bold">{job.panelInstallDuration}h</span>
                          </div>
                          <div className="font-medium text-foreground mb-1 pl-2">{job.customerName}</div>
                          
                          {isWithin2Weeks && job.tentativePanelDate && (
                            <button 
                              onClick={(e) => handleConfirmClick(job.id, 'panels', job.tentativePanelDate!, e)}
                              className="w-full mt-1 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[10px] font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Confirm
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {provided.placeholder}
                      
                      {tentativePostsOnDay.length === 0 && tentativePanelsOnDay.length === 0 && !snapshot.isDraggingOver && (
                        <div className="border border-dashed border-orange-200 rounded p-2 flex items-center justify-center text-muted-foreground opacity-50 h-full min-h-[60px]">
                          <span className="text-[10px]">Drop to plan</span>
                        </div>
                      )}
                      
                      {snapshot.isDraggingOver && (
                        <div className="border-2 border-dashed border-orange-400 rounded p-3 flex items-center justify-center bg-orange-100/50">
                          <span className="text-xs text-orange-700 font-medium">Drop to plan tentatively</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </div>
    </div>
  );
}
