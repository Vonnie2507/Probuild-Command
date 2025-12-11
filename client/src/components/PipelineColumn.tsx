import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Job } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { Droppable } from "@hello-pangea/dnd";
import { JobCard } from "./JobCard";

interface PipelineColumnProps {
  columnId: string;
  title: string;
  jobs: Job[];
}

export function PipelineColumn({ columnId, title, jobs }: PipelineColumnProps) {
  const totalValue = jobs.reduce((sum, job) => sum + job.quoteValue, 0);

  return (
    <div className="flex flex-col h-full min-w-[280px] w-[280px] max-w-[280px] bg-muted/40 rounded-lg border border-border/60">
      <div className="p-3 border-b bg-muted/30 flex flex-col gap-1 sticky top-0 z-10 rounded-t-lg backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground/80">
            {title}
          </h3>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
            {jobs.length}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground font-medium">
          Vol: <span className="text-foreground">${totalValue.toLocaleString()}</span>
        </div>
      </div>

      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <ScrollArea className="flex-1 h-full">
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={cn(
                "p-2 min-h-[150px] transition-colors h-full",
                snapshot.isDraggingOver ? "bg-primary/5" : "bg-transparent"
              )}
            >
              {jobs.map((job, index) => (
                <JobCard key={job.id} job={job} index={index} />
              ))}
              {provided.placeholder}
            </div>
          </ScrollArea>
        )}
      </Droppable>
    </div>
  );
}
