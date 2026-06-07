'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Two-way binding between a small piece of React state and URL query
 * params, designed for the entity explorers.
 *
 * • Reads the initial state from the current URL on mount (so a
 *   reload or shared link restores the same filter combo).
 * • After every state change, writes back to the URL via
 *   router.replace() so the browser history doesn't pollute with
 *   every keystroke. Search text is debounced (250ms) to keep the
 *   URL from spamming as the user types.
 * • Skips writing keys whose value equals the default — keeps URLs
 *   short ("/clients" rather than "/clients?filter=all&sort=name").
 * • Preserves any params it doesn't own (e.g. ?selected=<id>) so
 *   independent URL state (like the split-view selection) keeps
 *   working alongside this hook.
 *
 * `serialise`/`parse` are pure functions you supply that translate
 * between your state shape and URLSearchParams. They run on every
 * change; keep them cheap.
 */

export function useUrlState<S>({
  basePath,
  defaultState,
  serialise,
  parse,
  debounceKeys = []
}: {
  basePath: string;
  defaultState: S;
  /** Convert state → params (omit defaults to keep URL clean). */
  serialise: (state: S) => Record<string, string | null>;
  /** Convert params → state (fall back to defaults for missing keys). */
  parse: (params: URLSearchParams) => S;
  /** Keys whose changes should be debounced before hitting the URL. */
  debounceKeys?: (keyof S)[];
}): [S, (next: S | ((prev: S) => S)) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Lazy init: parse the URL once on mount. After this, we own the
  // state and write back to the URL ourselves.
  const [state, setState] = useState<S>(() => parse(new URLSearchParams(searchParams.toString())));

  const lastStateRef = useRef<S>(state);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeUrl = useCallback(
    (nextState: S) => {
      const next = serialise(nextState);
      const current = new URLSearchParams(searchParams.toString());

      let changed = false;
      for (const [k, v] of Object.entries(next)) {
        const curr = current.get(k);
        if (v === null || v === undefined || v === '') {
          if (curr !== null) {
            current.delete(k);
            changed = true;
          }
        } else if (curr !== v) {
          current.set(k, v);
          changed = true;
        }
      }
      if (!changed) return;
      const qs = current.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams, serialise]
  );

  // Sync state → URL whenever state changes.
  useEffect(() => {
    const prev = lastStateRef.current;
    const next = state;
    lastStateRef.current = next;

    // Determine whether the change is purely on a debounced key.
    const prevSerial = serialise(prev);
    const nextSerial = serialise(next);
    let touchedNonDebounced = false;
    for (const k of Object.keys(nextSerial)) {
      if (prevSerial[k] === nextSerial[k]) continue;
      if (!debounceKeys.includes(k as keyof S)) {
        touchedNonDebounced = true;
        break;
      }
    }

    if (touchedNonDebounced) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      writeUrl(next);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => writeUrl(next), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Public setter wraps useState's so external code feels like
  // regular useState.
  const set = useCallback((next: S | ((prev: S) => S)) => {
    setState((prev) =>
      typeof next === 'function' ? (next as (p: S) => S)(prev) : next
    );
  }, []);

  return useMemo(() => [state, set], [state, set]);
}
