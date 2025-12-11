import { useState } from "react";
import { Job, PIPELINES, getDailyInstallCapacity, STAFF_MEMBERS } from "@/lib/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, MapPin, Truck, Factory, Users, Clock, User, Info } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

interface SchedulerDashboardProps {
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
}

export function SchedulerDashboard({ jobs }: SchedulerDashboardProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Capacity Logic
  const dailyTotalHours = getDailyInstallCapacity(); // e.g., 32 hours (4 guys * 8 hours)
  const availableTeams = 2; // Team A, Team B

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
  const pendingPostInstall = jobs.filter(j => j.installStage === 'pending_posts' && PIPELINES.production.some(p => p.id === j.status));
  const pendingPanelInstall = jobs.filter(j => j.installStage === 'pending_panels');
  
  // Calendar Logic
  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      
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
                {STAFF_MEMBERS.filter(s => s.role === 'install').map(s => (
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
            <CardContent className="p-3 space-y-2">
              {pendingPostInstall.map(job => (
                <div key={job.id} className="bg-muted/30 border rounded p-2 text-xs hover:bg-muted transition-colors cursor-grab active:cursor-grabbing group">
                  <div className="font-bold flex justify-between mb-1">
                    <span>{job.jobId}</span>
                    <span className="text-muted-foreground font-normal">{job.estimatedProductionDuration}d prod</span>
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
                </div>
              ))}
              {pendingPostInstall.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">No jobs waiting for posts</div>}
            </CardContent>
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
            <CardContent className="p-3 space-y-2">
               {pendingPanelInstall.map(job => (
                <div key={job.id} className="bg-muted/30 border rounded p-2 text-xs hover:bg-muted transition-colors cursor-grab active:cursor-grabbing">
                  <div className="font-bold flex justify-between mb-1">
                    <span>{job.jobId}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] border-green-200 text-green-700 bg-green-50">Posts In</Badge>
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
                </div>
              ))}
              {pendingPanelInstall.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">No panels ready for install</div>}
            </CardContent>
          </Card>
        </div>

        {/* 3. Install Calendar */}
        <div className="flex-1 flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-heading font-semibold text-lg">Installation Schedule</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>Prev Week</Button>
              <span className="font-mono font-medium text-sm w-32 text-center">
                {format(startDate, "MMM d")} - {format(endDate, "MMM d")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>Next Week</Button>
            </div>
          </div>

          <div className="grid grid-cols-5 flex-1 divide-x divide-border overflow-hidden">
            {weekDays.slice(0, 5).map(day => {
              const isToday = isSameDay(day, new Date());
              const postJobs = jobs.filter(j => j.postInstallDate && isSameDay(j.postInstallDate, day));
              const panelJobs = jobs.filter(j => j.panelInstallDate && isSameDay(j.panelInstallDate, day));
              
              // Calculate Daily Load
              const totalBookedHours = 
                postJobs.reduce((sum, j) => sum + j.postInstallDuration, 0) + 
                panelJobs.reduce((sum, j) => sum + j.panelInstallDuration, 0);
              
              const capacityPercent = Math.min(100, Math.round((totalBookedHours / dailyTotalHours) * 100));
              const isOverCapacity = totalBookedHours > dailyTotalHours;

              return (
                <div key={day.toString()} className={cn("flex flex-col h-full", isToday && "bg-primary/5")}>
                  <div className={cn("p-2 text-center border-b font-medium text-sm", isToday && "text-primary font-bold")}>
                    {format(day, "EEE d")}
                    <div className="mt-1.5 flex items-center gap-1.5 justify-center">
                       <div className={cn("h-1.5 w-16 rounded-full overflow-hidden", isOverCapacity ? "bg-red-100" : "bg-muted")}>
                         <div className={cn("h-full transition-all", isOverCapacity ? "bg-red-500" : capacityPercent > 80 ? "bg-orange-500" : "bg-green-500")} style={{ width: `${capacityPercent}%` }} />
                       </div>
                       <span className={cn("text-[9px] font-mono", isOverCapacity ? "text-red-600 font-bold" : "text-muted-foreground")}>{totalBookedHours}h</span>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                    
                    {/* Post Installs */}
                    {postJobs.map(job => (
                      <div key={`post-${job.id}`} className="bg-blue-50 border border-blue-200 rounded p-2 text-xs shadow-sm hover:border-blue-400 cursor-pointer group relative overflow-hidden">
                        {/* Duration Bar */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                        
                        <div className="flex items-center justify-between mb-1 pl-2">
                          <span className="font-bold text-blue-700">POSTS</span>
                          <span className="text-[9px] font-mono font-bold bg-white px-1 rounded border border-blue-100 text-blue-600">{job.postInstallDuration}h</span>
                        </div>
                        <div className="font-medium text-foreground mb-0.5 pl-2">{job.customerName}</div>
                         <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-2">
                          <Truck className="h-3 w-3" /> Team A ({job.postInstallCrewSize} Pax)
                        </div>
                      </div>
                    ))}

                    {/* Panel Installs */}
                    {panelJobs.map(job => (
                      <div key={`panel-${job.id}`} className="bg-purple-50 border border-purple-200 rounded p-2 text-xs shadow-sm hover:border-purple-400 cursor-pointer group relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500"></div>

                        <div className="flex items-center justify-between mb-1 pl-2">
                          <span className="font-bold text-purple-700">PANELS</span>
                          <span className="text-[9px] font-mono font-bold bg-white px-1 rounded border border-purple-100 text-purple-600">{job.panelInstallDuration}h</span>
                        </div>
                        <div className="font-medium text-foreground mb-0.5 pl-2">{job.customerName}</div>
                         <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-2">
                          <Truck className="h-3 w-3" /> Team B ({job.panelInstallCrewSize} Pax)
                        </div>
                      </div>
                    ))}
                    
                    {/* Empty Slots */}
                    <div className="border border-dashed border-border rounded p-2 flex items-center justify-center text-muted-foreground opacity-50 hover:opacity-100 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all">
                      <span className="text-[10px]">+ Add Slot</span>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
