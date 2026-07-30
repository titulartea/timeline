import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { RoomState, TimelineEvent, TimelineSettings } from '../types';

const normalizeEvents = (events: TimelineEvent[]) => {
  return [...events]
    .sort((a, b) => {
      const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.year - b.year;
    })
    .map((event, index) => ({
      ...event,
      displayOrder: event.displayOrder ?? index,
    }));
};

export function useRealtimeRoom(roomId: string = 'default-timeline') {
  const [roomState, setRoomState] = useState<RoomState>({
    roomId,
    settings: {},
    events: [],
  });

  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Firestore Realtime Synchronization
  useEffect(() => {
    const roomRef = doc(db, 'rooms', roomId);

    const unsubscribe = onSnapshot(
      roomRef,
      (snapshot) => {
        setIsConnected(true);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setRoomState({
            roomId,
            settings: data.settings || {},
            events: Array.isArray(data.events) ? normalizeEvents(data.events) : [],
          });
        } else {
          // Initialize empty document in Firestore if it doesn't exist
          setDoc(roomRef, {
            settings: {},
            events: [],
          }).catch((err) => console.error('Error seeding room to Firestore:', err));
        }
      },
      (error) => {
        console.error('Firestore snapshot error:', error);
        setIsConnected(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  // Save changes to Firestore
  const syncToFirestore = useCallback(
    async (newSettings: TimelineSettings, newEvents: TimelineEvent[]) => {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(roomRef, { settings: newSettings, events: newEvents }, { merge: true });
      } catch (err) {
        console.error('Failed to sync changes to Firestore:', err);
      }
    },
    [roomId]
  );

  const addEvent = useCallback(
    (event: TimelineEvent) => {
      setRoomState((prev) => {
        const nextOrder = prev.events.reduce((max, current) => Math.max(max, current.displayOrder ?? -1), -1) + 1;
        const updatedEvents = [...prev.events, { ...event, displayOrder: event.displayOrder ?? nextOrder }];
        syncToFirestore(prev.settings, updatedEvents);
        return { ...prev, events: updatedEvents };
      });
    },
    [syncToFirestore]
  );

  const updateEvent = useCallback(
    (event: TimelineEvent) => {
      setRoomState((prev) => {
        const updatedEvents = prev.events.map((e) => (e.id === event.id ? event : e));
        syncToFirestore(prev.settings, updatedEvents);
        return { ...prev, events: updatedEvents };
      });
    },
    [syncToFirestore]
  );

  const deleteEvent = useCallback(
    (eventId: string) => {
      setRoomState((prev) => {
        const updatedEvents = prev.events.filter((e) => e.id !== eventId);
        syncToFirestore(prev.settings, updatedEvents);
        return { ...prev, events: updatedEvents };
      });
    },
    [syncToFirestore]
  );

  return {
    roomState,
    isConnected,
    addEvent,
    updateEvent,
    deleteEvent,
  };
}
