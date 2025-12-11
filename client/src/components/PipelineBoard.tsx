import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useState, useEffect } from "react";
import { Job, MOCK_JOBS } from "@/lib/mockData";
import { PipelineColumn } from "./PipelineColumn";

interface PipelineBoardProps {
  columns: { id: string; title: string }[];
  jobs: Job[];
  onJobMove: (jobId: string, newStatus: string) => void;
  statusField?: 'status' | 'salesStage';
}

export function PipelineBoard({ columns, jobs, onJobMove, statusField = 'status' }: PipelineBoardProps) {
  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    onJobMove(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto pb-4 pt-2 px-1">
        {columns.map((col) => {
          const colJobs = jobs.filter((job) => (job as any)[statusField] === col.id);
          return (
            <PipelineColumn
              key={col.id}
              columnId={col.id}
              title={col.title}
              jobs={colJobs}
            />
          );
        })}
      </div>
    </DragDropContext>
  );
}
