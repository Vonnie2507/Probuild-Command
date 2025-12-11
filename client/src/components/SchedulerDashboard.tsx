import { useState } from "react";
import { Job, PIPELINES, STAFF_MEMBERS } from "@/lib/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar as CalendarIcon, MapPin, Phone, Truck, CheckCircle2 } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface SchedulerDashboardProps {
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
}

export function SchedulerDashboard({ jobs }: SchedulerDashboardProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Jobs ready for install but not scheduled
  const readyJobs = jobs.filter(j => j.readyForInstall && !j.installDate);
  
  // Jobs scheduled
  const scheduledJobs = jobs.filter(j => j.installDate);

  // Simple Weekly Calendar
  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar: Ready for Install */}
      <div className="w-80 flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-heading font-semibold text-lg">Ready to Schedule</h3>
          <Badge variant="secondary">{readyJobs.length}</Badge>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {readyJobs.map(job => (
            <Card key={job.id} className="cursor-grab hover:shadow-md transition-all border-l-4 border-l-emerald-500">
              <CardContent className="p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-xs font-bold bg-muted px-1.5 py-0.5 rounded">{job.jobId}</span>
                  <Badge variant="outline" className="text-[10px] h-5 border-emerald-200 bg-emerald-50 text-emerald-700">
                    Ready
                  </Badge>
                </div>
                <h4 className="font-semibold text-sm leading-tight mb-1">{job.customerName}</h4>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{job.address}</span>
                </div>
                <Button size="sm" variant="secondary" className="w-full h-7 text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1.5" />
                  Schedule Now
                </Button>
              </CardContent>
            </Card>
          ))}
          
          {readyJobs.length === 0 && (
            <div className="text-center p-8 border-2 border-dashed rounded-lg text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No jobs waiting for install</p>
            </div>
          )}
        </div>
      </div>

      {/* Main: Calendar */}
      <div className="flex-1 flex flex-col h-full bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-muted/20">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Installation Schedule
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>Prev Week</Button>
            <span className="font-mono font-medium text-sm w-32 text-center">
              {format(startDate, "MMM d")} - {format(endDate, "MMM d")}
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>Next Week</Button>
          </div>
        </div>

        <div className="grid grid-cols-5 flex-1 divide-x divide-border">
          {weekDays.slice(0, 5).map(day => {
            const dayJobs = scheduledJobs.filter(j => j.installDate && isSameDay(j.installDate, day));
            const isToday = isSameDay(day, new Date());
            
            return (
              <div key={day.toString()} className={cn("flex flex-col h-full", isToday && "bg-primary/5")}>
                <div className={cn("p-2 text-center border-b font-medium text-sm", isToday && "text-primary font-bold")}>
                  {format(day, "EEE d")}
                </div>
                <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                  {dayJobs.map(job => (
                    <div key={job.id} className="bg-white border rounded p-2 text-xs shadow-sm hover:border-primary cursor-pointer group">
                      <div className="font-bold text-primary mb-0.5 group-hover:underline">{job.customerName}</div>
                      <div className="text-muted-foreground flex items-center gap-1 mb-1">
                        <MapPin className="h-3 w-3" /> {job.address.split(',')[0]}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-dashed">
                        <Truck className="h-3 w-3 text-orange-600" />
                        <span className="font-medium text-orange-700">Team A</span>
                      </div>
                    </div>
                  ))}
                  <Button variant="ghost" className="w-full h-8 text-xs text-muted-foreground border border-dashed border-transparent hover:border-border">
                    + Add Slot
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
