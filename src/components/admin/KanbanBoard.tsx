"use client";

import React, { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { cn, getInitials, availabilityBadgeClass, formatRelativeTime } from "@/lib/cn";
import type { PipelineStage } from "@/types";

type KanbanCard = {
  id: string;
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_headline: string;
  candidate_availability: string;
  status: string;
  pipeline_stage_id: string | null;
  match_score: number | null;
  rating: number | null;
  seen_at: string | null;
  applied_at: string;
};

interface ColumnProps {
  stage: PipelineStage;
  cards: KanbanCard[];
  activeId: string | null;
  onCardClick: (card: KanbanCard) => void;
}

function KanbanCardItem({ card, isDragging }: { card: KanbanCard; isDragging?: boolean }) {
  const score = card.match_score != null ? Math.round(card.match_score <= 1 ? card.match_score * 100 : card.match_score) : null;

  return (
    <div className={cn(
      "bg-bg-secondary border border-border rounded-xl p-3 space-y-2 cursor-grab active:cursor-grabbing transition-all",
      isDragging ? "opacity-40 rotate-1 scale-95" : "hover:border-border-hover hover:shadow-sm",
      !card.seen_at && "border-l-2 border-l-primary/50"
    )}>
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold shrink-0">
          {getInitials(card.candidate_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-light truncate">{card.candidate_name}</p>
          {card.candidate_headline && (
            <p className="text-[11px] text-text-dim truncate mt-0.5">{card.candidate_headline}</p>
          )}
        </div>
        {!card.seen_at && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" title="Unseen" />
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={availabilityBadgeClass(card.candidate_availability)}>
          {card.candidate_availability}
        </span>
        {score !== null && (
          <span className={cn(
            "text-[10px] font-mono font-medium",
            score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-text-dim"
          )}>
            {score}%
          </span>
        )}
        {card.rating && (
          <span className="text-[10px] text-amber-400">{"★".repeat(card.rating)}</span>
        )}
      </div>

      <p className="text-[10px] text-text-dim/60">{formatRelativeTime(card.applied_at)}</p>
    </div>
  );
}

function DroppableColumn({ stage, cards, activeId, onCardClick }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const stageColor: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    gray: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    pink: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  };
  const colClass = stageColor[stage.color] || stageColor.blue;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 min-w-[220px] w-[220px] shrink-0 rounded-xl border p-2 transition-colors",
        isOver ? "border-primary/50 bg-primary/5" : "border-border bg-bg-hover/30"
      )}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", colClass)}>
          {stage.name}
        </span>
        <span className="text-xs text-text-dim font-mono">{cards.length}</span>
      </div>

      <div className="flex flex-col gap-2 min-h-[60px]">
        {cards.map((card) => (
          <DraggableCard
            key={card.application_id}
            card={card}
            isDragging={activeId === card.application_id}
            onClick={() => onCardClick(card)}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex-1 rounded-lg border border-dashed border-border/50 flex items-center justify-center py-6">
            <p className="text-xs text-text-muted">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card, isDragging, onClick }: { card: KanbanCard; isDragging: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: card.application_id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
    >
      <KanbanCardItem card={card} isDragging={isDragging} />
    </div>
  );
}

interface KanbanBoardProps {
  stages: PipelineStage[];
  cards: KanbanCard[];
  onStageChange: (applicationId: string, newStageId: string) => Promise<void>;
  onCardClick: (card: KanbanCard) => void;
}

export default function KanbanBoard({ stages, cards, onStageChange, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const cardsByStage = useCallback(() => {
    const map: Record<string, KanbanCard[]> = {};
    for (const s of stages) map[s.id] = [];
    // Unassigned go in first column
    const firstStage = stages[0];
    for (const card of cards) {
      const stageId = card.pipeline_stage_id && map[card.pipeline_stage_id] !== undefined
        ? card.pipeline_stage_id
        : (firstStage?.id ?? "__none__");
      if (!map[stageId]) map[stageId] = [];
      map[stageId].push(card);
    }
    return map;
  }, [stages, cards]);

  const grouped = cardsByStage();
  const activeCard = cards.find((c) => c.application_id === activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const newStageId = over.id as string;
    const card = cards.find((c) => c.application_id === active.id);
    if (!card || card.pipeline_stage_id === newStageId) return;
    await onStageChange(card.application_id, newStageId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <DroppableColumn
            key={stage.id}
            stage={stage}
            cards={grouped[stage.id] || []}
            activeId={activeId}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard && <KanbanCardItem card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
