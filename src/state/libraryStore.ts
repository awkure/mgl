import { useCallback, useRef, useSyncExternalStore } from "react";
import type { LibraryContextValue } from "./LibraryContext";

export type LibrarySnapshot = LibraryContextValue;

const OUTSIDE_PROVIDER = "useLibrary must be used inside LibraryProvider";

let snapshot: LibrarySnapshot | null = null;
let providerActive = false;
const listeners = new Set<() => void>();

export function activateLibraryStore(): void {
  providerActive = true;
}

export function deactivateLibraryStore(): void {
  providerActive = false;
  snapshot = null;
  listeners.forEach((listener) => listener());
}

function assertProviderSnapshot(): LibrarySnapshot {
  if (!providerActive || snapshot === null) {
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
