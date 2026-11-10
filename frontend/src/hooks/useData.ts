import { useState, useCallback, useEffect, useRef } from "react";
import { request } from "../services/api";
export function useData<T = any>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<T>(url);
      if (version === generation.current) setData(result);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  return { data, error, loading, reload };
}
