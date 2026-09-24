'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getStoredGlobalPhrases,
  type GlobalPhraseEntry,
} from '@/lib/globalPhrases';

export function useGlobalPhrases() {
  const [phrasesMap, setPhrasesMap] = useState<Record<string, GlobalPhraseEntry>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const reloadPhrases = useCallback(() => {
    const data = getStoredGlobalPhrases();
    setPhrasesMap(data);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    reloadPhrases();

    const handleUpdate = () => {
      reloadPhrases();
    };

    window.addEventListener('global-phrases-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('global-phrases-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [reloadPhrases]);

  const allPhrases = useMemo(() => {
    return Object.values(phrasesMap).sort((a, b) => {
      if (b.uniqueVideoCount !== a.uniqueVideoCount) {
        return b.uniqueVideoCount - a.uniqueVideoCount;
      }
      return b.occurrencesCount - a.occurrencesCount;
    });
  }, [phrasesMap]);

  // High frequency phrases appearing in >= 3 different videos
  const commonPhrases = useMemo(() => {
    return allPhrases.filter((p) => p.uniqueVideoCount >= 3);
  }, [allPhrases]);

  return {
    allPhrases,
    commonPhrases,
    isLoaded,
    reloadPhrases,
    totalTracked: allPhrases.length,
    highFrequencyCount: commonPhrases.length,
  };
}
