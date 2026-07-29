import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { onSnapshot, doc } from 'firebase/firestore';

export function useFirestoreStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    // A simple listener to a non-existent doc just to monitor connection state
    // Firestore handles this internally but we can observe it
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'health'),
      () => {
        setIsOnline(true);
        setLastSync(new Date());
      },
      (error) => {
        // If it's a permission error, we are still "online" but just can't read this doc
        // If it's a network error, it will trigger the error callback
        if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
          setIsOnline(false);
        } else {
          setIsOnline(true);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return { isOnline, lastSync };
}
