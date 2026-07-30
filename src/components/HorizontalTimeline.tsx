import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, Edit2, X, MapPin } from 'lucide-react';
import { TimelineEvent, TimelineSettings } from '../types';
import { formatYearRange, formatYearWithBcAd } from '../utils/dateUtils';

interface HorizontalTimelineProps {
  events: TimelineEvent[];
  settings: TimelineSettings;
  onEditEvent: (event: TimelineEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddEventWithRange: (startYear: number, endYear?: number, laneSide?: 'above' | 'below') => void;
  onReorderEvent: (eventId: string, targetEventId: string, position?: 'before' | 'after') => void;
}

interface EventWithLane extends TimelineEvent {
  lane: number;
  side: 'above' | 'below';
}

const FIXED_EVENT_COLOR = 'rgb(74, 111, 165)';

export const HorizontalTimeline: React.FC<HorizontalTimelineProps> = ({
  events,
  onEditEvent,
  onDeleteEvent,
  onAddEventWithRange,
  onReorderEvent,
}) => {
  // Zoom level controls canvas width and tick detail (0.08 to 60 scale)
  const [zoomLevel, setZoomLevel] = useState(0.2);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  // Drag interaction modes: 'none' | 'create' (사건/범위 생성) | 'pan' (타임라인 이동)
  const [dragMode, setDragMode] = useState<'none' | 'create' | 'pan'>('none');
  const [dragStartYear, setDragStartYear] = useState<number | null>(null);
  const [panStartX, setPanStartX] = useState<number>(0);
  const [panStartY, setPanStartY] = useState<number>(0);
  const [panScrollLeft, setPanScrollLeft] = useState<number>(0);
  const [panScrollTop, setPanScrollTop] = useState<number>(0);

  const [currentHoverYear, setCurrentHoverYear] = useState<number | null>(null);
  const [currentHoverX, setCurrentHoverX] = useState<number | null>(null);
  const [isNearBaseline, setIsNearBaseline] = useState<boolean>(false);
  const [viewportScrollLeft, setViewportScrollLeft] = useState<number>(0);
  const [dragPlacementSide, setDragPlacementSide] = useState<'above' | 'below'>('above');
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dropTargetEventId, setDropTargetEventId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<'before' | 'after'>('before');
  const lastReorderSignatureRef = useRef<string | null>(null);
  const activeTouchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startZoom: number;
    centerX: number;
  } | null>(null);
  const isPinchingRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<React.PointerEvent<HTMLDivElement>['pointerType'] | null>(null);

  // Auto-center vertical scroll position on mount
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      container.scrollTop = (container.scrollHeight - container.clientHeight) / 2;
    }
  }, []);

  // Dynamic wide year bounds (-4200 BC ~ +3000 AD base)
  const defaultMin = -4200;
  const defaultMax = 3000;

  const eventYears = events.flatMap((e) => [
    e.year,
    e.endYear !== undefined && e.endYear !== null ? e.endYear : e.year,
  ]);

  const minYear = defaultMin;
  const maxYear = eventYears.length > 0 ? Math.max(defaultMax, Math.ceil(Math.max(...eventYears) / 500) * 500 + 500) : defaultMax;

  const yearRange = Math.max(100, maxYear - minYear);
  const totalWidth = Math.max(900, Math.round(yearRange * zoomLevel * 0.8));
  const pixelsPerYear = totalWidth / yearRange;

  // Focal Wheel Zoom handler: Zooms in/out keeping the cursor position fixed on screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const containerRect = container.getBoundingClientRect();
        const cursorXInContainer = e.clientX - containerRect.left;
        const currentScrollLeft = container.scrollLeft;
        const currentTotalWidth = axisRef.current ? axisRef.current.getBoundingClientRect().width : totalWidth;
        const ratio = (currentScrollLeft + cursorXInContainer) / currentTotalWidth;

        const zoomDelta = e.deltaY < 0 ? 0.5 : -0.5;
        setZoomLevel((prev) => {
          const nextZoom = Math.max(0.08, Math.min(60, +(prev + zoomDelta).toFixed(2)));
          if (nextZoom === prev) return prev;

          // Focal scroll alignment after re-render
          requestAnimationFrame(() => {
            if (axisRef.current && containerRef.current) {
              const newTotalWidth = axisRef.current.getBoundingClientRect().width;
              const targetScrollLeft = ratio * newTotalWidth - cursorXInContainer;
              containerRef.current.scrollLeft = Math.max(0, targetScrollLeft);
            }
          });

          return nextZoom;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [totalWidth]);

  // Responsive Dynamic Tick Steps calculation in ASCENDING candidate order
  const tickStep = useMemo(() => {
    const candidateSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const minPixelGap = 65; // Minimum px distance between year tick labels

    for (const step of candidateSteps) {
      if (step * pixelsPerYear >= minPixelGap) {
        return step;
      }
    }
    return 5000;
  }, [pixelsPerYear]);

  // Generate Major and Minor Ticks
  const { majorTicks, minorTicks } = useMemo(() => {
    const majors: number[] = [];
    const minors: number[] = [];

    const minorStep = tickStep / 5 >= 1 ? tickStep / 5 : tickStep;

    let t = Math.floor(minYear / tickStep) * tickStep;
    let guard = 0;
    while (t <= maxYear && guard < 3000) {
      majors.push(t);
      t += tickStep;
      guard++;
    }

    if (minorStep < tickStep) {
      let mt = Math.floor(minYear / minorStep) * minorStep;
      let mGuard = 0;
      while (mt <= maxYear && mGuard < 5000) {
        if (mt % tickStep !== 0) {
          minors.push(mt);
        }
        mt += minorStep;
        mGuard++;
      }
    }

    return { majorTicks: majors, minorTicks: minors };
  }, [minYear, maxYear, tickStep]);

  // Interval Stacking Layout Algorithm for overlapping range bars & pins
  const eventsWithLanes = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.year - b.year;
    });
    const laneEndsAbove: number[] = [];
    const laneEndsBelow: number[] = [];
    const pinYearWidth = Math.max(15, Math.ceil(120 / pixelsPerYear));

    return sorted.map((event) => {
      const hasEnd = event.endYear !== undefined && event.endYear !== null && event.endYear !== event.year;
      const start = event.year;
      const end = hasEnd ? (event.endYear as number) : event.year + pinYearWidth;
      const side = event.laneSide === 'below' ? 'below' : 'above';
      const laneEnds = side === 'below' ? laneEndsBelow : laneEndsAbove;

      let assignedLane = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= start) {
          assignedLane = i;
          laneEnds[i] = end + Math.max(2, Math.ceil(10 / pixelsPerYear));
          break;
        }
      }

      if (assignedLane === -1) {
        assignedLane = laneEnds.length;
        laneEnds.push(end + Math.max(2, Math.ceil(10 / pixelsPerYear)));
      }

      return {
        ...event,
        lane: assignedLane,
        side,
      } as EventWithLane;
    });
  }, [events, pixelsPerYear]);

  const maxAboveLane = useMemo(() => {
    return eventsWithLanes.reduce((max, e) => (e.side === 'above' ? Math.max(max, e.lane) : max), 0);
  }, [eventsWithLanes]);

  const maxBelowLane = useMemo(() => {
    return eventsWithLanes.reduce((max, e) => (e.side === 'below' ? Math.max(max, e.lane) : max), 0);
  }, [eventsWithLanes]);

  // Convert pixel position to year
  const getYearFromX = (x: number): number => {
    if (!axisRef.current) return 0;
    const rect = axisRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, x / rect.width));
    let yr = Math.round(minYear + pct * yearRange);
    if (yr === 0) yr = 1;
    return yr;
  };

  const getInteractionState = (clientX: number, clientY: number) => {
    if (!axisRef.current) return null;

    const rect = axisRef.current.getBoundingClientRect();
    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;
    const yr = getYearFromX(currentX);

    const baselineY = rect.height * 0.5;
    const distFromBaseline = Math.abs(currentY - baselineY);

    return { currentX, currentY, yr, distFromBaseline };
  };

  const getBaselineThreshold = (pointerType: string) => (pointerType === 'touch' ? 56 : 35);

  const applyZoomAtClientX = (clientX: number, targetZoom: number) => {
    const container = containerRef.current;
    const axis = axisRef.current;
    if (!container || !axis) return;

    const containerRect = container.getBoundingClientRect();
    const cursorXInContainer = clientX - containerRect.left;
    const currentTotalWidth = axis.getBoundingClientRect().width;
    const ratio = (container.scrollLeft + cursorXInContainer) / currentTotalWidth;

    setZoomLevel((prev) => {
      const nextZoom = Math.max(0.08, Math.min(60, +targetZoom.toFixed(2)));
      if (nextZoom === prev) return prev;

      requestAnimationFrame(() => {
        if (axisRef.current && containerRef.current) {
          const newTotalWidth = axisRef.current.getBoundingClientRect().width;
          const targetScrollLeft = ratio * newTotalWidth - cursorXInContainer;
          containerRef.current.scrollLeft = Math.max(0, targetScrollLeft);
        }
      });

      return nextZoom;
    });
  };

  const clearPinchState = () => {
    isPinchingRef.current = false;
    pinchGestureRef.current = null;
  };

  const finalizeInteraction = () => {
    if (dragMode === 'create' && dragStartYear !== null && currentHoverYear !== null) {
      const start = Math.min(dragStartYear, currentHoverYear);
      const end = Math.max(dragStartYear, currentHoverYear);

      if (Math.abs(end - start) < 2) {
        onAddEventWithRange(start, undefined, dragPlacementSide);
      } else {
        onAddEventWithRange(start, end, dragPlacementSide);
      }
    }

    setDragMode('none');
    setDragStartYear(null);
    setCurrentHoverX(null);
    setCurrentHoverYear(null);
    setIsNearBaseline(false);
    setDragPlacementSide('above');
    activePointerTypeRef.current = null;
  };

  // Pointer Handlers for Click & Drag Creation VS Panning Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!axisRef.current || !containerRef.current) return;

    if (e.pointerType !== 'touch' && activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      if (activeTouchPointsRef.current.size >= 2) {
        const points = Array.from(activeTouchPointsRef.current.values()).slice(0, 2);
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        pinchGestureRef.current = {
          startDistance: distance,
          startZoom: zoomLevel,
          centerX: (points[0].x + points[1].x) / 2,
        };
        isPinchingRef.current = true;
        setDragMode('none');
        setDragStartYear(null);
        setCurrentHoverX(null);
        setCurrentHoverYear(null);
        setIsNearBaseline(false);
        setDragPlacementSide('above');
        activePointerIdRef.current = null;
        return;
      }
    }

    if ((e.target as HTMLElement | null)?.closest('[data-timeline-event="true"]')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    activePointerIdRef.current = e.pointerId;
    activePointerTypeRef.current = e.pointerType;
    e.currentTarget.setPointerCapture(e.pointerId);

    const interactionState = getInteractionState(e.clientX, e.clientY);
    if (!interactionState) return;

    const { currentX, yr, distFromBaseline } = interactionState;
    const baselineThreshold = getBaselineThreshold(e.pointerType);
    const baselineY = axisRef.current.getBoundingClientRect().height * 0.5;

    if (distFromBaseline <= baselineThreshold) {
      setDragMode('create');
      setDragStartYear(yr);
      setCurrentHoverX(currentX);
      setCurrentHoverYear(yr);
      setIsNearBaseline(true);
      setDragPlacementSide(e.clientY >= axisRef.current.getBoundingClientRect().top + baselineY ? 'below' : 'above');
    } else {
      setDragMode('pan');
      setPanStartX(e.clientX);
      setPanStartY(e.clientY);
      setPanScrollLeft(containerRef.current.scrollLeft);
      setPanScrollTop(containerRef.current.scrollTop);
      setIsNearBaseline(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!axisRef.current) return;

    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (isPinchingRef.current && pinchGestureRef.current && activeTouchPointsRef.current.size >= 2) {
        e.preventDefault();

        const points = Array.from(activeTouchPointsRef.current.values()).slice(0, 2);
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const centerX = (points[0].x + points[1].x) / 2;
        const scale = distance / pinchGestureRef.current.startDistance;

        applyZoomAtClientX(centerX, pinchGestureRef.current.startZoom * scale);
        return;
      }
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    e.preventDefault();

    const interactionState = getInteractionState(e.clientX, e.clientY);
    if (!interactionState) return;

    const { currentX, yr, distFromBaseline } = interactionState;
    setIsNearBaseline(distFromBaseline <= getBaselineThreshold(activePointerTypeRef.current ?? e.pointerType));
    setCurrentHoverX(currentX);
    setCurrentHoverYear(yr);

    if (dragMode === 'pan' && containerRef.current) {
      const deltaX = e.clientX - panStartX;
      const deltaY = e.clientY - panStartY;
      containerRef.current.scrollLeft = panScrollLeft - deltaX;
      containerRef.current.scrollTop = panScrollTop - deltaY;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.delete(e.pointerId);

      if (isPinchingRef.current) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }

        if (activeTouchPointsRef.current.size < 2) {
          clearPinchState();
        }
        return;
      }
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    activePointerIdRef.current = null;
    finalizeInteraction();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.delete(e.pointerId);

      if (isPinchingRef.current) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }

        if (activeTouchPointsRef.current.size < 2) {
          clearPinchState();
        }
        return;
      }
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    activePointerIdRef.current = null;
    finalizeInteraction();
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPinchingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    if (dragMode === 'create') {
      finalizeInteraction();
    } else {
      setDragMode('none');
      setDragStartYear(null);
      setCurrentHoverX(null);
      setCurrentHoverYear(null);
      setIsNearBaseline(false);
      setDragPlacementSide('above');
    }
  };

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setViewportScrollLeft(e.currentTarget.scrollLeft);
  };

  // Live drag rectangle bounds
  const dragRectPct = useMemo(() => {
    if (dragMode !== 'create' || dragStartYear === null || currentHoverYear === null) return null;
    const startYr = Math.min(dragStartYear, currentHoverYear);
    const endYr = Math.max(dragStartYear, currentHoverYear);

    const startPct = ((startYr - minYear) / yearRange) * 100;
    const endPct = ((endYr - minYear) / yearRange) * 100;

    return {
      leftPct: Math.max(0, Math.min(100, startPct)),
      widthPct: Math.max(0.1, Math.min(100, endPct - startPct)),
      startYr,
      endYr,
    };
  }, [dragMode, dragStartYear, currentHoverYear, minYear, yearRange]);
  const dragRectSideStyle =
    dragPlacementSide === 'below'
      ? { top: 'calc(50% + 22px)' }
      : { bottom: 'calc(50% + 14px)' };

  // Dynamic canvas height to fit all lanes cleanly across screen
  const canvasMinHeight = Math.max(2000, 260 + (maxAboveLane + maxBelowLane + 1) * 64);

  const getEventColor = (event: TimelineEvent) => event.color || FIXED_EVENT_COLOR;

  const clearDragState = () => {
    setDraggedEventId(null);
    setDropTargetEventId(null);
    setDropTargetPosition('before');
    lastReorderSignatureRef.current = null;
  };

  const handleEventDragStart = (e: React.DragEvent<HTMLElement>, eventId: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
    setDraggedEventId(eventId);
  };

  const handleEventDragOver = (e: React.DragEvent<HTMLElement>, eventId: string) => {
    if (!draggedEventId || draggedEventId === eventId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const reorderSignature = `${draggedEventId}:${eventId}:${position}`;

    if (lastReorderSignatureRef.current !== reorderSignature) {
      lastReorderSignatureRef.current = reorderSignature;
      onReorderEvent(draggedEventId, eventId, position);
    }

    setDropTargetEventId(eventId);
    setDropTargetPosition(position);
  };

  const handleEventDrop = (e: React.DragEvent<HTMLElement>, eventId: string) => {
    e.preventDefault();

    const sourceEventId = draggedEventId || e.dataTransfer.getData('text/plain');
    if (sourceEventId && sourceEventId !== eventId) {
      onReorderEvent(sourceEventId, eventId, dropTargetPosition);
    }

    clearDragState();
  };

  return (
    <div
      id="horizontal-timeline-container"
      ref={containerRef}
      onScroll={handleContainerScroll}
      className="w-full h-full min-h-screen bg-white overflow-x-auto overflow-y-auto relative select-none"
    >
      <div
        ref={axisRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        className={`relative w-full h-full min-h-screen touch-none ${
          dragMode === 'pan'
            ? 'cursor-grabbing'
            : isNearBaseline
            ? 'cursor-crosshair'
            : 'cursor-grab'
        }`}
        style={{ width: `${totalWidth}px`, minHeight: `${canvasMinHeight}px`, touchAction: 'none' }}
      >
        {/* Main Central Horizontal Baseline Axis Line (Screen Vertical Center: 50%) */}
        <div
          className="absolute left-0 right-0 h-1 bg-[#2d3436] -translate-y-1/2"
          style={{ top: '50%' }}
        />

        {/* Minor Ticks */}
        {minorTicks.map((tickYear) => {
          const pct = ((tickYear - minYear) / yearRange) * 100;
          if (pct < 0 || pct > 100) return null;
          return (
            <div
              key={`minor-${tickYear}`}
              className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none z-0"
              style={{ left: `${pct}%`, top: '50%' }}
            >
              <div className="w-[1px] h-2 bg-gray-300" />
            </div>
          );
        })}

        {/* Major Ticks with BC/AD Year Labels STRICTLY BELOW the Baseline Line */}
        {majorTicks.map((tickYear) => {
          const pct = ((tickYear - minYear) / yearRange) * 100;
          if (pct < 0 || pct > 100) return null;

          return (
            <div
              key={`major-${tickYear}`}
              className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none z-10"
              style={{ left: `${pct}%`, top: '50%' }}
            >
              {/* Major Tick Line extending downwards */}
              <div className="w-[1px] h-3.5 bg-gray-400" />

              {/* Plain Text BC / AD Year Label (수직선 바로 밑에 위치) */}
              <span className="text-xs font-mono text-gray-400 font-normal mt-1 whitespace-nowrap tracking-tight select-none">
                {formatYearWithBcAd(tickYear)}
              </span>
            </div>
          );
        })}

        {/* Live Drag Selection Range Overlay (Central Baseline line 클릭 드래그 시) */}
        {dragMode === 'create' && dragRectPct && (
          <div
            className="absolute h-7 rounded-none z-30 pointer-events-none flex items-center justify-center border border-dashed border-[#2d3436] -translate-y-1/2"
            style={{
              left: `${dragRectPct.leftPct}%`,
              width: `${dragRectPct.widthPct}%`,
              ...dragRectSideStyle,
              backgroundColor: 'rgba(74, 111, 165, 0.4)',
            }}
          >
            <span className="text-white px-2 py-0.5 text-[10px] font-mono font-bold whitespace-nowrap bg-[#2d3436]">
              {formatYearRange(dragRectPct.startYr, dragRectPct.endYr)}
            </span>
          </div>
        )}

        {/* Hover Pointer Line near baseline */}
        {dragMode === 'none' && isNearBaseline && currentHoverX !== null && currentHoverYear !== null && (
          <div
            className="absolute w-[1px] border-l border-dashed border-[#4a6fa5] pointer-events-none z-20"
            style={{
              left: `${(currentHoverX / totalWidth) * 100}%`,
              top: '50%',
            }}
          >
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#2d3436] text-white px-1.5 py-0.5 text-[10px] font-mono shadow whitespace-nowrap">
              {formatYearWithBcAd(currentHoverYear)}
            </div>
          </div>
        )}

        {/* Render Events (Range Bars OR Point Pins Stacked ABOVE Central Baseline Line) */}
        {eventsWithLanes.map((event) => {
          const hasEndRange =
            event.endYear !== undefined && event.endYear !== null && event.endYear !== event.year;

          const startPct = Math.max(0, Math.min(100, ((event.year - minYear) / yearRange) * 100));
          const barLeftPx = (startPct / 100) * totalWidth;

          // Stacked lane height offset from the baseline on each side
          const laneOffsetPx = 22 + event.lane * 42;
          const renderWidthPx = hasEndRange ? Math.max(28, Math.max(0, ((event.endYear as number) - event.year) * pixelsPerYear)) : 0;
          const floatingLabelMaxWidthPx = Math.max(0, Math.min(260, renderWidthPx - 16));
          const floatingLabelLeftPx = Math.min(
            barLeftPx + renderWidthPx - floatingLabelMaxWidthPx - 8,
            Math.max(barLeftPx + 8, viewportScrollLeft + 8)
          );
          const labelShouldFloat = hasEndRange
            ? barLeftPx < viewportScrollLeft + 12 && barLeftPx + renderWidthPx > viewportScrollLeft
            : false;
          const isBelowSide = event.side === 'below';
          const eventColor = getEventColor(event);
          const sideStyle = isBelowSide
            ? { top: `calc(50% + ${laneOffsetPx + 28}px)` }
            : { bottom: `calc(50% + ${laneOffsetPx}px)` };

          if (hasEndRange) {
            // 1. Time Range Bar (범위 이벤트 - 직사각형 rounded-none, 고정색 rgb(74, 111, 165))
            return (
              <React.Fragment key={event.id}>
                {labelShouldFloat && (
                  <div
                    className="absolute h-7 flex items-center pointer-events-none z-30"
                    style={{
                      left: `${Math.max(barLeftPx + 8, floatingLabelLeftPx)}px`,
                      ...sideStyle,
                    }}
                  >
                    <span
                      className="truncate whitespace-nowrap px-2 py-0.5 text-xs font-medium text-white shadow-2xs"
                      style={{
                        backgroundColor: eventColor,
                        maxWidth: `${floatingLabelMaxWidthPx}px`,
                      }}
                    >
                      {event.title}
                    </span>
                  </div>
                )}

                <div
                  data-timeline-event="true"
                  draggable
                  onDragStart={(e) => handleEventDragStart(e, event.id)}
                  onDragOver={(e) => handleEventDragOver(e, event.id)}
                  onDrop={(e) => handleEventDrop(e, event.id)}
                  onDragEnd={clearDragState}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(event);
                  }}
                  className={`absolute h-7 rounded-none px-2 flex items-center cursor-pointer shadow-2xs transition-all hover:brightness-110 z-20 overflow-hidden ${
                      draggedEventId === event.id ? 'opacity-40 scale-[0.99]' : ''
                    } ${dropTargetEventId === event.id ? 'ring-2 ring-[#2d3436] ring-offset-1' : ''}`}
                  style={{
                    left: `${startPct}%`,
                    width: `${renderWidthPx}px`,
                    ...sideStyle,
                    backgroundColor: eventColor,
                  }}
                  title={`${event.title} (${formatYearRange(event.year, event.endYear)})`}
                >
                  {!labelShouldFloat && (
                    <span className="text-xs font-medium text-white truncate whitespace-nowrap">
                      {event.title}
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          } else {
            // 2. Point Event - Pin Marker (범위 없는 단일 사건 마일스톤)
            const stemHeightPx = laneOffsetPx;
            return (
              <div
                key={event.id}
                data-timeline-event="true"
                draggable
                onDragStart={(e) => handleEventDragStart(e, event.id)}
                onDragOver={(e) => handleEventDragOver(e, event.id)}
                onDrop={(e) => handleEventDrop(e, event.id)}
                onDragEnd={clearDragState}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEvent(event);
                }}
                className={`absolute flex items-center cursor-pointer group z-20 -translate-x-1/2 pointer-events-auto ${isBelowSide ? 'flex-col' : 'flex-col'} ${
                  draggedEventId === event.id ? 'opacity-40 scale-[0.99]' : ''
                } ${dropTargetEventId === event.id ? 'ring-2 ring-[#2d3436] ring-offset-1' : ''}`}
                style={{
                  left: `${startPct}%`,
                  [isBelowSide ? 'top' : 'bottom']: 'calc(50% + 20px)',
                }}
                title={`${event.title} (${formatYearWithBcAd(event.year)})`}
              >
                {isBelowSide ? (
                  <>
                    <div
                      className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-2xs -mb-1 transition-transform group-hover:scale-125"
                      style={{ backgroundColor: eventColor }}
                    />
                    <div
                      className="w-[1.5px] bg-gray-400 group-hover:bg-[#2d3436] transition-colors"
                      style={{ height: `${stemHeightPx}px` }}
                    />
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-none text-xs font-medium text-white shadow-2xs group-hover:scale-105 transition-transform whitespace-nowrap mt-0.5"
                      style={{ backgroundColor: eventColor }}
                    >
                      <MapPin className="w-3 h-3 fill-white text-transparent" />
                      <span>{event.title}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-none text-xs font-medium text-white shadow-2xs group-hover:scale-105 transition-transform whitespace-nowrap mb-0.5"
                      style={{ backgroundColor: eventColor }}
                    >
                      <MapPin className="w-3 h-3 fill-white text-transparent" />
                      <span>{event.title}</span>
                    </div>
                    <div
                      className="w-[1.5px] bg-gray-400 group-hover:bg-[#2d3436] transition-colors"
                      style={{ height: `${stemHeightPx}px` }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-2xs -mt-1 transition-transform group-hover:scale-125"
                      style={{ backgroundColor: eventColor }}
                    />
                  </>
                )}
              </div>
            );
          }
        })}
      </div>

      {/* Detail Popover / Modal (클릭 시에만 노출되는 상세/수정/삭제 모달) */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d3436]/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-[#e1e1e1] rounded-none w-full max-w-md p-6 shadow-lg text-[#2d3436] space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-[#e1e1e1] pb-3">
              <div>
                <span
                  className="text-xs font-mono font-bold text-white px-2 py-0.5"
                  style={{ backgroundColor: getEventColor(selectedEvent) }}
                >
                  {formatYearRange(selectedEvent.year, selectedEvent.endYear)}
                </span>
                <h3 className="text-base font-bold text-[#2d3436] mt-2">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-[#2d3436] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedEvent.description ? (
              <p className="text-xs text-gray-600 leading-relaxed bg-[#f8f9fa] p-3 border border-[#e1e1e1]">
                {selectedEvent.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic"></p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e1e1e1]">
              <button
                onClick={() => {
                  onDeleteEvent(selectedEvent.id);
                  setSelectedEvent(null);
                }}
                className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-none text-xs font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제</span>
              </button>

              <button
                onClick={() => {
                  onEditEvent(selectedEvent);
                  setSelectedEvent(null);
                }}
                className="px-4 py-1.5 bg-[#2d3436] text-white hover:bg-[#1e2324] rounded-none text-xs font-bold flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>수정</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
