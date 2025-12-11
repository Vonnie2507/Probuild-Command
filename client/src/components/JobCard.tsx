import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Job } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { CalendarClock, Mail, MessageSquare, Phone, User, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";

interface JobCardProps {
  job: Job;
  index: number;
}

export function JobCard({ job, index }: JobCardProps) {
  const getUrgencyColor = (urgency: Job["urgency"]) => {
    switch (urgency) {
      case "critical": return "border-l-red-500 bg-red-50/30";
      case "high": return "border-l-orange-500 bg-orange-50/30";
      case "medium": return "border-l-yellow-500";
      default: return "border-l-emerald-500";
    }
  };

  const getUrgencyIcon = (urgency: Job["urgency"]) => {
    switch (urgency) {
      case "critical": return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "high": return <Clock className="h-4 w-4 text-orange-500" />;
      default: return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    }
  };

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="mb-3"
          style={{ ...provided.draggableProps.style }}
        >
          <Card 
            className={cn(
              "group relative overflow-hidden transition-all hover:shadow-md border-l-4", 
              getUrgencyColor(job.urgency),
              snapshot.isDragging && "rotate-2 shadow-xl ring-2 ring-primary/20 opacity-90 z-50"
            )}
          >
            <CardHeader className="p-3 pb-2 space-y-0">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {job.jobId}
                    </span>
                    {getUrgencyIcon(job.urgency)}
                  </div>
                  <h3 className="font-semibold text-sm leading-tight text-foreground line-clamp-1">
                    {job.customerName}
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-primary block">
                    ${job.quoteValue.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                {job.address}
              </p>
            </CardHeader>

            <CardContent className="p-3 pt-2 pb-2">
              <p className="text-xs text-foreground/80 line-clamp-2 mb-3 bg-muted/30 p-1.5 rounded border border-border/50">
                "{job.lastNote}"
              </p>
              
              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div className={cn(
                  "flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border",
                  job.daysSinceLastContact > 3 ? "text-red-600 border-red-100 bg-red-50" : "border-border"
                )}>
                  <MessageSquare className="h-3 w-3" />
                  <span>{job.daysSinceLastContact}d ago</span>
                </div>
                
                {job.daysSinceQuoteSent !== undefined && (
                   <div className={cn(
                    "flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border",
                    job.daysSinceQuoteSent > 7 ? "text-orange-600 border-orange-100 bg-orange-50" : "border-border"
                  )}>
                    <CalendarClock className="h-3 w-3" />
                    <span>Quote: {job.daysSinceQuoteSent}d</span>
                  </div>
                )}
              </div>
              
              <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="uppercase tracking-wider font-medium">{job.assignedStaff}</span>
              </div>
            </CardContent>

            <CardFooter className="p-2 bg-muted/40 flex justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-green-600">
                <Phone className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-blue-600">
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-purple-600">
                <Mail className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-orange-600 ml-auto">
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </Draggable>
  );
}

// Icon helper
function FileText(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}
