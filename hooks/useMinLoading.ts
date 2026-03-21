import { useState, useCallback, useRef } from "react";

const MIN_LOADING_DURATION = 500;

async function enforceMinDelay(startTime: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
}

export async function withMinDelay<T>(promise: Promise<T>, minMs = MIN_LOADING_DURATION): Promise<T> {
  const start = Date.now();
  try {
    const result = await promise;
    await enforceMinDelay(start, minMs);
    return result;
  } catch (error) {
    await enforceMinDelay(start, minMs);
    throw error;
  }
}

export function useMinLoading(minMs = MIN_LOADING_DURATION) {
  const [isLoading, setIsLoading] = useState(false);
  const startTimeRef = useRef<number>(0);

  const startLoading = useCallback(() => {
    startTimeRef.current = Date.now();
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(async () => {
    await enforceMinDelay(startTimeRef.current, minMs);
    setIsLoading(false);
  }, [minMs]);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      startTimeRef.current = Date.now();
      setIsLoading(true);
      try {
        const result = await fn();
        await enforceMinDelay(startTimeRef.current, minMs);
        return result;
      } catch (error) {
        await enforceMinDelay(startTimeRef.current, minMs);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [minMs],
  );

  return { isLoading, startLoading, stopLoading, wrapAsync };
}
