import { useEffect, useState, useCallback } from "react";
import { api, type GitStatusResponse } from "@/lib/api";

const POLL_MS = 30_000;

/**
 * Polls /api/workspace/git-status at a fixed interval.
 * Returns null while loading, and the parsed response once available.
 * Errors set the `error` field silently — no retry storm, caller handles
 * the fallback UI.
 */
export function useGitStatus() {
  const [data, setData] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getGitStatus()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        // Only set error on first failure or if data was previously null
        setError((prev) => (prev === null ? e.message : prev));
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { data, error };
}
