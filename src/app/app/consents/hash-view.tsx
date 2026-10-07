"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old in-page anchors (from canvas tools and earlier links) mapped to the matching section. */
const HASH_VIEWS: Record<string, string> = {
  request: "/app/consents?view=request",
  partners: "/app/consents?view=partners",
  requests: "/app/consents?view=requests",
};

/**
 * Sections are views (`?view=`) now, so `/app/consents#request` would only show the default view.
 * Mounted on the default view, this replaces such a URL with its section once.
 */
export function HashView() {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      const target = HASH_VIEWS[window.location.hash.slice(1)];
      if (target) router.replace(target);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [router]);
  return null;
}
