import "server-only";
import { cookies } from "next/headers";

export type Theme = "light" | "dark";

/** Theme preference from the `theme` cookie (set by the appearance toggle). */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}
