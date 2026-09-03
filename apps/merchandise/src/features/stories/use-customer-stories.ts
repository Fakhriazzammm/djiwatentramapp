import { useCallback, useEffect, useState } from "react";
import { storiesClient, StoriesClientError } from "./stories-client";
import type { CustomerStory, StoryApiState } from "./story-types";

export function useCustomerStories(enabled = true) {
  const [stories, setStories] = useState<CustomerStory[]>([]);
  const [state, setState] = useState<StoryApiState>(enabled && storiesClient.isConfigured ? "loading" : "disabled");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !storiesClient.isConfigured) {
      setState("disabled");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const items = await storiesClient.list(signal);
      if (!signal?.aborted) {
        setStories(items);
        setState("ready");
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setState("error");
        setError(cause instanceof StoriesClientError ? cause.message : "Story belum dapat dimuat.");
      }
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { stories, state, error, refresh };
}
