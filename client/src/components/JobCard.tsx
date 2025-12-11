import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Job } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { CalendarClock, Mail, MessageSquare, Phone, User, AlertCircle, CheckCircle2, Clock, FileText, MapPin, DollarSign, Calendar, Briefcase, ExternalLink, Loader2, Send, Wrench } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WorkType {
  id: number;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
}

interface ServiceM8Note {
  uuid: string;
  note: string;
  create_date: string;
  edit_date?: string;
  entry_method?: string;
  note_type?: string;
  created_by_staff_name?: string;
  active?: number;
}

interface ServiceM8Activity {
  uuid: string;
  job_uuid: string;
  activity_was_scheduled: number;
  staff_uuid: string;
  start_date: string;
  end_date: string;
  active: number;
}

interface CommunicationItem {
  uuid: string;
  date: string;
  type: 'note' | 'activity' | 'email' | 'sms' | 'call';
  content: string;
  staffName?: string;
}

interface JobCardProps {
  job: Job;
  index: number;
}

interface CompanyInfo {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyMobile: string;
  contacts: Array<{
    uuid: string;
    name: string;
    email: string;
    mobile: string;
    phone: string;
    isPrimary: boolean;
  }>;
}

export function JobCard({ job, index }: JobCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  
  // Company info state
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingCompanyInfo, setLoadingCompanyInfo] = useState(false);
  const [companyInfoError, setCompanyInfoError] = useState<string | null>(null);
  
  // SMS compose state
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);

  // Email compose state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [loadingEmailContact, setLoadingEmailContact] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch work types for the dropdown
  const { data: workTypes = [] } = useQuery<WorkType[]>({
    queryKey: ["workTypes"],
    queryFn: async () => {
      const res = await fetch("/api/work-types");
      if (!res.ok) throw new Error("Failed to fetch work types");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  // Mutation to update job work type
  const updateJobMutation = useMutation({
    mutationFn: async (workTypeId: number) => {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workTypeId }),
      });
      if (!res.ok) throw new Error("Failed to update job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({
        title: "Job type updated",
        description: "The job type has been changed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update job type",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  
  const handleWorkTypeChange = (workTypeId: string) => {
    if (workTypeId && workTypeId !== "none") {
      updateJobMutation.mutate(parseInt(workTypeId));
    }
  };
  
  const currentWorkType = workTypes.find(wt => wt.id === job.workTypeId);
  
  useEffect(() => {
    if (detailsOpen && job.serviceM8Uuid) {
      setLoadingNotes(true);
      setNotesError(null);
      fetch(`/api/servicem8/job-history/${job.serviceM8Uuid}`)
        .then(async res => {
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `Error ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          const items: CommunicationItem[] = [];
          
          // Process notes
          if (Array.isArray(data.notes)) {
            for (const note of data.notes) {
              const noteText = (note.note || '').toLowerCase();
              let commType: CommunicationItem['type'] = 'note';
              if (noteText.includes('email') || noteText.includes('sent email')) {
                commType = 'email';
              } else if (noteText.includes('sms') || noteText.includes('text')) {
                commType = 'sms';
              } else if (noteText.includes('call') || noteText.includes('phone') || noteText.includes('spoke') || noteText.includes('rang')) {
                commType = 'call';
              }
              
              items.push({
                uuid: note.uuid,
                date: note.create_date?.replace(' ', 'T') || new Date().toISOString(),
                type: commType,
                content: note.note || '',
                staffName: note.created_by_staff_name
              });
            }
          }
          
          // Process activities (scheduled visits, etc.)
          if (Array.isArray(data.activities)) {
            for (const activity of data.activities) {
              items.push({
                uuid: activity.uuid,
                date: activity.start_date?.replace(' ', 'T') || new Date().toISOString(),
                type: 'activity',
                content: `Scheduled activity: ${activity.start_date} - ${activity.end_date}`
              });
            }
          }
          
          // Sort by date descending
          items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setCommunications(items);
        })
        .catch(err => {
          console.error("Failed to fetch job history:", err);
          setNotesError(err.message || "Failed to load communication history");
        })
        .finally(() => setLoadingNotes(false));
        
      // Also fetch company info
      setLoadingCompanyInfo(true);
      setCompanyInfoError(null);
      fetch(`/api/servicem8/job-company/${job.serviceM8Uuid}`)
        .then(async res => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to fetch company info");
          }
          return res.json();
        })
        .then(data => {
          setCompanyInfo(data);
        })
        .catch(err => {
          console.error("Failed to fetch company info:", err);
          setCompanyInfoError(err.message || "Could not load company contacts");
        })
        .finally(() => setLoadingCompanyInfo(false));
    }
  }, [detailsOpen, job.serviceM8Uuid]);

  // Fetch contact info when SMS dialog opens
  useEffect(() => {
    if (smsDialogOpen && job.serviceM8Uuid) {
      setLoadingContact(true);
      fetch(`/api/servicem8/job-contact/${job.serviceM8Uuid}`)
        .then(res => res.json())
        .then(data => {
          // Prefer mobile, fallback to phone
          const phoneNumber = data.mobile || data.phone || "";
          setSmsPhone(phoneNumber);
        })
        .catch(err => {
          console.error("Failed to fetch contact:", err);
        })
        .finally(() => setLoadingContact(false));
    }
  }, [smsDialogOpen, job.serviceM8Uuid]);

  // Fetch contact info when email dialog opens
  useEffect(() => {
    if (emailDialogOpen && job.serviceM8Uuid) {
      setLoadingEmailContact(true);
      fetch(`/api/servicem8/job-contact/${job.serviceM8Uuid}`)
        .then(res => res.json())
        .then(data => {
          setEmailTo(data.email || "");
        })
        .catch(err => {
          console.error("Failed to fetch contact email:", err);
        })
        .finally(() => setLoadingEmailContact(false));
    }
  }, [emailDialogOpen, job.serviceM8Uuid]);

  const handleOpenSmsDialog = () => {
    setSmsMessage("");
    setSmsDialogOpen(true);
  };

  const handleOpenEmailDialog = () => {
    setEmailSubject("");
    setEmailBody("");
    setEmailDialogOpen(true);
  };

  const handleSendSms = async () => {
    if (!smsPhone || !smsMessage.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter a phone number and message",
        variant: "destructive"
      });
      return;
    }

    setSendingSms(true);
    try {
      const response = await fetch("/api/messaging/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: smsPhone,
          message: smsMessage,
          jobUuid: job.serviceM8Uuid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to send SMS");
      }

      toast({
        title: "SMS sent!",
        description: `Message sent to ${smsPhone}`,
      });

      setSmsDialogOpen(false);
      setSmsMessage("");
    } catch (error: any) {
      toast({
        title: "Failed to send SMS",
        description: error.message || "Please check your ServiceM8 connection",
        variant: "destructive"
      });
    } finally {
      setSendingSms(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailSubject.trim() || !emailBody.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter an email address, subject, and message",
        variant: "destructive"
      });
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch("/api/messaging/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
          jobUuid: job.serviceM8Uuid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to send email");
      }

      toast({
        title: "Email sent!",
        description: `Email sent to ${emailTo}`,
      });

      setEmailDialogOpen(false);
      setEmailSubject("");
      setEmailBody("");
    } catch (error: any) {
      toast({
        title: "Failed to send email",
        description: error.message || "Please check your ServiceM8 connection",
        variant: "destructive"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const getCommIcon = (item: CommunicationItem) => {
    switch (item.type) {
      case 'email': return <Mail className="h-4 w-4 text-purple-500" />;
      case 'sms': return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'call': return <Phone className="h-4 w-4 text-green-500" />;
      case 'activity': return <Calendar className="h-4 w-4 text-orange-500" />;
      default: return <FileText className="h-4 w-4 text-gray-500" />;
    }
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
                {/* Show CLIENT contact (when they last contacted us) - this is what we care about! */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border cursor-help",
                      (job.daysSinceClientContact ?? job.daysSinceLastContact) > 3
                        ? "text-red-600 border-red-100 bg-red-50"
                        : "border-border"
                    )}>
                      {(job.lastClientContactType || job.lastCommunicationType) === 'email' ? <Mail className="h-3 w-3" /> :
                       (job.lastClientContactType || job.lastCommunicationType) === 'call' ? <Phone className="h-3 w-3" /> :
                       (job.lastClientContactType || job.lastCommunicationType) === 'sms' ? <MessageSquare className="h-3 w-3" /> :
                       <MessageSquare className="h-3 w-3" />}
                      <span>
                        {job.daysSinceClientContact !== undefined && job.daysSinceClientContact !== null
                          ? `Client: ${job.daysSinceClientContact}d ago`
                          : `${job.daysSinceLastContact}d ago`}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>
                      {job.daysSinceClientContact !== undefined && job.daysSinceClientContact !== null
                        ? `Client last contacted us: ${job.lastClientContactType || 'message'} ${job.daysSinceClientContact} days ago`
                        : `Last contact: ${job.lastCommunicationType === 'email' ? 'Email' :
                           job.lastCommunicationType === 'call' ? 'Phone call' :
                           job.lastCommunicationType === 'sms' ? 'SMS' : 'Note'} ${job.daysSinceLastContact} days ago`}
                    </p>
                  </TooltipContent>
                </Tooltip>
                
                {(job.daysSinceQuoteSent !== null && job.daysSinceQuoteSent !== undefined) || 
                 (job.hoursSinceQuoteSent !== null && job.hoursSinceQuoteSent !== undefined) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex items-center gap-1.5 px-1.5 py-1 rounded border cursor-help font-medium",
                        (job.hoursSinceQuoteSent !== null && job.hoursSinceQuoteSent !== undefined) || (job.daysSinceQuoteSent !== undefined && job.daysSinceQuoteSent <= 3)
                          ? "text-green-700 border-green-300 bg-green-100" 
                          : job.daysSinceQuoteSent !== undefined && job.daysSinceQuoteSent <= 10 
                            ? "text-green-700 border-green-300 bg-green-100" 
                            : job.daysSinceQuoteSent !== undefined && job.daysSinceQuoteSent <= 15 
                              ? "text-yellow-700 border-yellow-300 bg-yellow-100" 
                              : "text-red-700 border-red-300 bg-red-100"
                      )}>
                        <CalendarClock className="h-3 w-3" />
                        <span>
                          {job.hoursSinceQuoteSent !== null && job.hoursSinceQuoteSent !== undefined
                            ? `${job.hoursSinceQuoteSent}h since quote`
                            : `${job.daysSinceQuoteSent}d since quote`}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>
                        {job.hoursSinceQuoteSent !== null && job.hoursSinceQuoteSent !== undefined
                          ? `Quote was sent ${job.hoursSinceQuoteSent} hours ago`
                          : `Quote was sent ${job.daysSinceQuoteSent} days ago`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              
              <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
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
                
                {/* Job Type Dropdown */}
                <Select
                  value={job.workTypeId?.toString() || "unassigned"}
                  onValueChange={handleWorkTypeChange}
                >
                  <SelectTrigger 
                    className="h-6 w-[130px] text-[10px] border-dashed"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`select-job-type-${job.id}`}
                  >
                    <Wrench className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate">
                      {currentWorkType?.name || "Job Type"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {workTypes.length > 0 ? (
                      workTypes.filter(wt => wt.isActive).map(wt => (
                        <SelectItem key={wt.id} value={wt.id.toString()}>
                          {wt.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No job types configured</SelectItem>
                    )}
                  </SelectContent>
                </Select>
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
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn(
                      "h-6 w-6 hover:bg-white hover:text-blue-600",
                      !job.serviceM8Uuid && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (job.serviceM8Uuid) handleOpenSmsDialog(); 
                    }}
                    disabled={!job.serviceM8Uuid}
                    data-testid={`button-sms-${job.id}`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{job.serviceM8Uuid ? "Send SMS" : "No ServiceM8 link"}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-6 w-6 hover:bg-white hover:text-purple-600",
                      !job.serviceM8Uuid && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (job.serviceM8Uuid) handleOpenEmailDialog();
                    }}
                    disabled={!job.serviceM8Uuid}
                    data-testid={`button-email-${job.id}`}
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{job.serviceM8Uuid ? "Send email" : "No ServiceM8 link"}</p>
                </TooltipContent>
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
          
          {/* Company Contact Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Company Contacts</span>
              </div>
              {loadingCompanyInfo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            
            {loadingCompanyInfo ? (
              <div className="flex items-center justify-center bg-muted/30 rounded-md p-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading company contacts...</span>
              </div>
            ) : companyInfoError ? (
              <div className="flex flex-col items-center justify-center bg-muted/30 rounded-md p-3 text-center">
                <AlertCircle className="h-5 w-5 text-amber-500 mb-2" />
                <p className="text-sm text-amber-600 font-medium">{companyInfoError}</p>
                <p className="text-xs text-muted-foreground mt-1">Please reconnect to ServiceM8 in Settings</p>
              </div>
            ) : companyInfo ? (
              <div className="bg-muted/30 rounded-md p-3 space-y-3">
                {/* Company Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {companyInfo.companyEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`mailto:${companyInfo.companyEmail}`} className="text-primary hover:underline truncate">
                        {companyInfo.companyEmail}
                      </a>
                    </div>
                  )}
                  {companyInfo.companyPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${companyInfo.companyPhone}`} className="hover:underline">
                        {companyInfo.companyPhone}
                      </a>
                    </div>
                  )}
                  {companyInfo.companyMobile && (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${companyInfo.companyMobile}`} className="hover:underline">
                        {companyInfo.companyMobile}
                      </a>
                    </div>
                  )}
                </div>
                
                {/* Contact List */}
                {companyInfo.contacts.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <span className="text-xs font-medium text-muted-foreground">Contacts</span>
                    {companyInfo.contacts.map((contact) => (
                      <div key={contact.uuid} className="flex items-center justify-between text-sm bg-white/50 rounded px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{contact.name}</span>
                          {contact.isPrimary && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">Primary</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {contact.mobile && (
                            <a href={`tel:${contact.mobile}`} className="hover:text-primary flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.mobile}
                            </a>
                          )}
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="hover:text-primary flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {!companyInfo.companyEmail && !companyInfo.companyPhone && !companyInfo.companyMobile && companyInfo.contacts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No contact information available</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3">
                {job.serviceM8Uuid ? "No company contact information found" : "Job not linked to ServiceM8"}
              </p>
            )}
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
          
          {/* Job Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="h-4 w-4" />
                <span>Job Type</span>
              </div>
              {workTypes.length > 0 ? (
                <Select
                  value={job.workTypeId?.toString() || "none"}
                  onValueChange={handleWorkTypeChange}
                >
                  <SelectTrigger className="h-9 text-sm" data-testid={`select-job-type-dialog-${job.id}`}>
                    <SelectValue placeholder="Select job type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workTypes.filter(wt => wt.isActive).map(wt => (
                      <SelectItem key={wt.id} value={wt.id.toString()}>
                        {wt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {currentWorkType?.name || "Not set"}
                </p>
              )}
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
                <CalendarClock className="h-4 w-4" />
                <span>Quote Age</span>
              </div>
              <p className="text-sm">
                {job.hoursSinceQuoteSent != null 
                  ? `${job.hoursSinceQuoteSent} hours since quote sent`
                  : job.daysSinceQuoteSent != null
                    ? `${job.daysSinceQuoteSent} days since quote sent`
                    : "Quote not sent yet"}
              </p>
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
              ) : communications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No communication history found</p>
              ) : (
                <div className="space-y-3">
                  {communications.map((item) => (
                    <div key={item.uuid} className="flex gap-3 p-2 bg-muted/30 rounded-md">
                      <div className="mt-0.5">{getCommIcon(item)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.date ? format(new Date(item.date), 'dd MMM yyyy, h:mm a') : 'Unknown date'}
                          </span>
                          {item.staffName && (
                            <span className="text-xs text-muted-foreground">by {item.staffName}</span>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {item.type}
                          </Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">{item.content}</p>
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
      
      {/* SMS Compose Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              Send SMS
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sms-to">To: {job.customerName}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sms-to"
                  type="tel"
                  placeholder="Phone number"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  disabled={loadingContact}
                  data-testid="input-sms-phone"
                />
                {loadingContact && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sms-message">Message</Label>
              <Textarea
                id="sms-message"
                placeholder="Type your message..."
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                rows={4}
                data-testid="input-sms-message"
              />
              <p className="text-xs text-muted-foreground">
                {smsMessage.length} characters
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setSmsDialogOpen(false)}
              disabled={sendingSms}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendSms}
              disabled={sendingSms || !smsPhone || !smsMessage.trim()}
              data-testid="button-send-sms"
            >
              {sendingSms ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send SMS
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Compose Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-purple-500" />
              Send Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">To: {job.customerName}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email-to"
                  type="email"
                  placeholder="Email address"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  disabled={loadingEmailContact}
                  data-testid="input-email-to"
                />
                {loadingEmailContact && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                type="text"
                placeholder="Email subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                data-testid="input-email-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-body">Message</Label>
              <Textarea
                id="email-body"
                placeholder="Type your message..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={6}
                data-testid="input-email-body"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
              disabled={sendingEmail}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendingEmail || !emailTo || !emailSubject.trim() || !emailBody.trim()}
              data-testid="button-send-email"
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
