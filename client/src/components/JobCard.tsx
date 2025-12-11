import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Job } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { CalendarClock, Mail, MessageSquare, Phone, User, AlertCircle, CheckCircle2, Clock, FileText, MapPin, DollarSign, Calendar, Briefcase, ExternalLink, Loader2 } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";

interface ServiceM8Note {
  uuid: string;
  note: string;
  timestamp: string;
  entry_method?: string;
  note_type?: string;
  created_by_staff_name?: string;
}

interface JobCardProps {
  job: Job;
  index: number;
}

export function JobCard({ job, index }: JobCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notes, setNotes] = useState<ServiceM8Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  
  useEffect(() => {
    if (detailsOpen && job.serviceM8Uuid) {
      setLoadingNotes(true);
      setNotesError(null);
      fetch(`/api/servicem8/job-notes/${job.serviceM8Uuid}`)
        .then(async res => {
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `Error ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (Array.isArray(data)) {
            const sorted = data.sort((a: ServiceM8Note, b: ServiceM8Note) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            setNotes(sorted);
          }
        })
        .catch(err => {
          console.error("Failed to fetch notes:", err);
          setNotesError(err.message || "Failed to load notes");
        })
        .finally(() => setLoadingNotes(false));
    }
  }, [detailsOpen, job.serviceM8Uuid]);
  
  const getNoteIcon = (note: ServiceM8Note) => {
    const method = note.entry_method?.toLowerCase() || '';
    const type = note.note_type?.toLowerCase() || '';
    if (method.includes('email') || type.includes('email')) return <Mail className="h-4 w-4 text-purple-500" />;
    if (method.includes('sms') || type.includes('sms')) return <MessageSquare className="h-4 w-4 text-blue-500" />;
    if (method.includes('call') || type.includes('call') || method.includes('phone')) return <Phone className="h-4 w-4 text-green-500" />;
    return <FileText className="h-4 w-4 text-gray-500" />;
  };
  
  // Completed jobs are green, Quote phase jobs are orange, Work Order phase jobs are blue
  const getLifecycleColor = () => {
    if (job.status === 'complete' || job.schedulerStage === 'recently_completed') {
      return "border-l-green-500 bg-green-50/50";
    }
    if (job.lifecyclePhase === 'quote') {
      return "border-l-orange-500 bg-orange-50/50";
    }
    return "border-l-blue-500 bg-blue-50/30";
  };

  const getUrgencyColor = (urgency: Job["urgency"]) => {
    // Urgency colors are secondary - lifecycle phase takes priority
    switch (urgency) {
      case "critical": return "ring-2 ring-red-300";
      case "high": return "ring-1 ring-orange-200";
      default: return "";
    }
  };

  const getUrgencyIcon = (urgency: Job["urgency"]) => {
    const icons = {
      critical: { icon: <AlertCircle className="h-4 w-4 text-red-500" />, label: "Critical priority - needs immediate attention" },
      high: { icon: <Clock className="h-4 w-4 text-orange-500" />, label: "High priority - follow up soon" },
      medium: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, label: "Normal priority" },
      low: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, label: "Low priority" }
    };
    const { icon, label } = icons[urgency] || icons.medium;
    return (
      <Tooltip>
        <TooltipTrigger asChild><span>{icon}</span></TooltipTrigger>
        <TooltipContent side="top"><p>{label}</p></TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
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
              getLifecycleColor(),
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border cursor-help",
                      job.daysSinceLastContact > 3 ? "text-red-600 border-red-100 bg-red-50" : "border-border"
                    )}>
                      {job.lastCommunicationType === 'email' ? <Mail className="h-3 w-3" /> :
                       job.lastCommunicationType === 'call' ? <Phone className="h-3 w-3" /> :
                       job.lastCommunicationType === 'sms' ? <MessageSquare className="h-3 w-3" /> :
                       <MessageSquare className="h-3 w-3" />}
                      <span>{job.daysSinceLastContact}d ago</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Last contact: {job.lastCommunicationType === 'email' ? 'Email sent' : 
                       job.lastCommunicationType === 'call' ? 'Phone call' : 
                       job.lastCommunicationType === 'sms' ? 'SMS message' : 'Note added'} {job.daysSinceLastContact} days ago</p>
                  </TooltipContent>
                </Tooltip>
                
                {job.daysSinceQuoteSent !== undefined && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border cursor-help",
                        job.daysSinceQuoteSent > 7 ? "text-orange-600 border-orange-100 bg-orange-50" : "border-border"
                      )}>
                        <CalendarClock className="h-3 w-3" />
                        <span>Quote: {job.daysSinceQuoteSent}d</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Quote was sent {job.daysSinceQuoteSent} days ago</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              
              <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <User className="h-3 w-3" />
                      <span className="uppercase tracking-wider font-medium">{job.assignedStaff}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Assigned staff member</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>

            <CardFooter className="p-2 bg-muted/40 flex justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-green-600">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Call customer</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-blue-600">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Send SMS</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-white hover:text-purple-600">
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Send email</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6 hover:bg-white hover:text-orange-600 ml-auto"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>View job details</p></TooltipContent>
              </Tooltip>
            </CardFooter>
          </Card>
        </div>
        )}
      </Draggable>
      
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-lg font-mono bg-muted px-2 py-1 rounded">{job.jobId}</span>
            <span className="text-xl">{job.customerName}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Address</span>
              </div>
              <p className="text-sm font-medium">{job.address || "No address"}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span>Quote Value</span>
              </div>
              <p className="text-lg font-bold text-primary">${job.quoteValue.toLocaleString()}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              <span>Description</span>
            </div>
            <p className="text-sm bg-muted/50 p-3 rounded-md">{job.description || "No description"}</p>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Assigned Staff</span>
              </div>
              <p className="text-sm font-medium">{job.assignedStaff}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Status</span>
              </div>
              <div className="flex gap-2">
                <Badge variant={job.lifecyclePhase === 'work_order' ? 'default' : 'secondary'}>
                  {job.lifecyclePhase === 'work_order' ? 'Work Order' : 'Quote'}
                </Badge>
                <Badge variant="outline">{job.status}</Badge>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Last Contact</span>
              </div>
              <p className="text-sm">
                {job.lastCommunicationType === 'email' ? 'Email' : 
                 job.lastCommunicationType === 'call' ? 'Phone call' : 
                 job.lastCommunicationType === 'sms' ? 'SMS' : 'Note'} - {job.daysSinceLastContact} days ago
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>Priority</span>
              </div>
              <Badge variant={job.urgency === 'critical' ? 'destructive' : job.urgency === 'high' ? 'default' : 'secondary'}>
                {job.urgency}
              </Badge>
            </div>
          </div>
          
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Communication History</span>
              </div>
              {loadingNotes && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            
            <ScrollArea className="h-[200px] rounded-md border p-2">
              {loadingNotes ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading communication history...
                </div>
              ) : notesError ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-4">
                  <AlertCircle className="h-5 w-5 text-amber-500 mb-2" />
                  <p className="text-sm text-amber-600 font-medium">{notesError}</p>
                  <p className="text-xs text-muted-foreground mt-1">Please reconnect to ServiceM8 in Settings</p>
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No communication history found</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.uuid} className="flex gap-3 p-2 bg-muted/30 rounded-md">
                      <div className="mt-0.5">{getNoteIcon(note)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {format(new Date(note.timestamp), 'dd MMM yyyy, h:mm a')}
                          </span>
                          {note.created_by_staff_name && (
                            <span className="text-xs text-muted-foreground">by {note.created_by_staff_name}</span>
                          )}
                          {note.entry_method && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {note.entry_method}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">{note.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          
          {(job.postInstallDate || job.panelInstallDate || job.tentativePostDate || job.tentativePanelDate) && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Schedule</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {job.postInstallDate && (
                    <div className="bg-green-50 border border-green-200 p-2 rounded">
                      <span className="font-medium text-green-700">Posts:</span> {format(job.postInstallDate, 'dd MMM yyyy')}
                    </div>
                  )}
                  {job.panelInstallDate && (
                    <div className="bg-green-50 border border-green-200 p-2 rounded">
                      <span className="font-medium text-green-700">Panels:</span> {format(job.panelInstallDate, 'dd MMM yyyy')}
                    </div>
                  )}
                  {job.tentativePostDate && (
                    <div className="bg-amber-50 border border-amber-200 p-2 rounded">
                      <span className="font-medium text-amber-700">Tentative Posts:</span> {format(job.tentativePostDate, 'dd MMM yyyy')}
                    </div>
                  )}
                  {job.tentativePanelDate && (
                    <div className="bg-amber-50 border border-amber-200 p-2 rounded">
                      <span className="font-medium text-amber-700">Tentative Panels:</span> {format(job.tentativePanelDate, 'dd MMM yyyy')}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          
          {job.serviceM8Uuid && (
            <>
              <Separator />
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open(`https://go.servicem8.com/job/${job.serviceM8Uuid}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in ServiceM8
              </Button>
            </>
          )}
        </div>
      </DialogContent>
      </Dialog>
    </>
  );
}
