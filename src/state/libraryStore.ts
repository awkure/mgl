import { useCallback, useRef, useSyncExternalStore } from "react";
import type { LibraryContextValue } from "./LibraryContext";

export type LibrarySnapshot = LibraryContextValue;

const OUTSIDE_PROVIDER = "useLibrary must be used inside LibraryProvider";

let snapshot: LibrarySnapshot | null = null;
let providerActive = false;
let clearGeneration = 0;
const listeners = new Set<() => void>();

export function activateLibraryStore(): void {
  providerActive = true;
  // Cancel a pending StrictMode teardown clear — remount republishes next.
  clearGeneration += 1;
}

export function deactivateLibraryStore(): void {
  // Do not notify subscribers after teardown: getSnapshot would throw and
  // blank the Vite StrictMode tree. Clear listeners; defer nulling snapshot
  // so a synchronous remount can activate + publish first.
  providerActive = false;
  listeners.clear();
  const generation = (clearGeneration += 1);
  queueMicrotask(() => {
    if (generation !== clearGeneration) return;
    if (!providerActive) snapshot = null;
  });
}

function assertProviderSnapshot(): LibrarySnapshot {
  if (snapshot === null) {
    throw new Error(OUTSIDE_PROVIDER);
  }
  return snapshot;
}

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibrarySnapshot(): LibrarySnapshot {
  return assertProviderSnapshot();
}

export function getLibraryServerSnapshot(): LibrarySnapshot {
  return assertProviderSnapshot();
}

export function publishLibrarySnapshot(next: LibrarySnapshot): void {
  if (!providerActive) return;
  if (snapshot === next) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function useLibrarySelector<T>(
  selector: (snap: LibrarySnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectedRef = useRef<T | undefined>(undefined);
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const getSelectedSnapshot = useCallback((): T => {
    const snap = assertProviderSnapshot();
    const next = selectorRef.current(snap);
    const prev = selectedRef.current;
    if (prev !== undefined && isEqualRef.current(prev, next)) {
      return prev;
    }
    selectedRef.current = next;
    return next;
  }, []);

  return useSyncExternalStore(subscribeLibrary, getSelectedSnapshot, getSelectedSnapshot);
}
