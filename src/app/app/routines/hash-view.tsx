"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Sections used to be anchors on one long page (`/app/routines/<id>#reflection`). They are views now
 * (`?view=reflection`), so a link that still carries the old hash opens that view, then the anchor.
 */
export function HashToView({ basePath, hash, view, active }: { basePath: string; hash: string; view: string; active: string }) {
  const router = useRouter();
  useEffect(() => {
    if (active !== view && window.location.hash === `#${hash}`) router.replace(`${basePath}?view=${encodeURIComponent(view)}#${hash}`);
  }, [basePath, hash, view, active, router]);
  return null;
}
