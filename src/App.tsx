import React, { useState, useMemo } from 'react';
import { useRealtimeRoom } from './hooks/useRealtimeRoom';
import { HorizontalTimeline } from './components/HorizontalTimeline';
import { EventModal } from './components/EventModal';
import { TimelineEvent } from './types';

export default function App() {
  const [roomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'default-timeline';
  });

  const {
    roomState,
    addEvent,
    updateEvent,
    deleteEvent,
  } = useRealtimeRoom(roomId);

  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [presetStartYear, setPresetStartYear] = useState<number | null>(null);
  const [presetEndYear, setPresetEndYear] = useState<number | null>(null);
  const [presetLaneSide, setPresetLaneSide] = useState<'above' | 'below'>('above');

  // Sorted events list for display
  const sortedEvents = useMemo(() => {
    return [...roomState.events].sort((a, b) => a.year - b.year);
  }, [roomState.events]);

  // Handlers
  const handleAddEventWithRange = (startYear: number, endYear?: number, laneSide: 'above' | 'below' = 'above') => {
    setEditingEvent(null);
    setPresetStartYear(startYear);
    setPresetEndYear(endYear || null);
    setPresetLaneSide(laneSide);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (event: TimelineEvent) => {
    setEditingEvent(event);
    setPresetStartYear(null);
    setPresetEndYear(null);
    setPresetLaneSide('above');
    setIsAddEditModalOpen(true);
  };

  const handleSaveEvent = (savedEvent: TimelineEvent) => {
    if (editingEvent) {
      updateEvent(savedEvent);
    } else {
      addEvent(savedEvent);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-white text-[#2d3436] font-sans">
      {/* Main Single-View Screen: Full Horizontal Timeline Canvas */}
      <main className="w-full h-full">
        <HorizontalTimeline
          events={sortedEvents}
          settings={roomState.settings}
          onEditEvent={handleOpenEditModal}
          onDeleteEvent={deleteEvent}
          onAddEventWithRange={handleAddEventWithRange}
        />
      </main>

      {/* Add / Edit Milestone Modal */}
      <EventModal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        onSave={handleSaveEvent}
        eventToEdit={editingEvent}
        presetStartYear={presetStartYear}
        presetEndYear={presetEndYear}
        presetLaneSide={presetLaneSide}
      />
    </div>
  );
}
