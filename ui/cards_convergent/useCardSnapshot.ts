// ui/cards_convergent/useCardSnapshot.ts
// UI adapter for Cards Convergent V2

import { CardSnapshot } from '../../services/cards_convergent/types';

export interface UseCardSnapshotResult {
  snapshot: CardSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCardSnapshot(cardId: string): UseCardSnapshotResult {
  console.log('🔍 useCardSnapshot hook for card:', cardId);
  
  const [snapshot, setSnapshot] = useState<CardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (typeof window !== 'undefined' && window.CardsConvergentV2) {
        const newSnapshot = window.CardsConvergentV2.getCardSnapshot(cardId);
        setSnapshot(newSnapshot);
      } else {
        setSnapshot(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [cardId]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  return {
    snapshot,
    isLoading,
    error,
    refresh
  };
}

// React hooks compatibility
declare global {
  interface Window {
    useState: any;
    useEffect: any;
    useCallback: any;
  }
}

// Fallback for non-React environments
if (typeof window !== 'undefined') {
  window.useCardSnapshot = useCardSnapshot;
}