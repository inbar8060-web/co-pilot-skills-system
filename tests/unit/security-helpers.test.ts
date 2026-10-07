import { describe, expect, it } from "vitest";
import { safeRelativePath, singleParams } from "@/lib/utils";
import { isCrossOriginWrite, isLoopbackHost, isProtectedPath } from "@/lib/route-access";
import { parseResearchFilters } from "@/lib/schemas";

describe("safeRelativePath (post-login redirect)", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeRelativePath("/app")).toBe("/app");
    expect(safeRelativePath("/app/routines?x=1#top")).toBe("/app/routines?x=1#top");
  });
  it("rejects protocol-relative, backslash and scheme forms", () => {
    expect(safeRelativePath("//evil.com")).toBeNull();
    expect(safeRelativePath("/\\evil.com")).toBeNull();
    expect(safeRelativePath("/\\\\evil.com/x")).toBeNull();
    expect(safeRelativePath("https://evil.com")).toBeNull();
    expect(safeRelativePath("javascript:alert(1)")).toBeNull();
    expect(safeRelativePath("/app" + String.fromCharCode(0))).toBeNull();
    expect(safeRelativePath("")).toBeNull();
    expect(safeRelativePath(null)).toBeNull();
    expect(safeRelativePath("/" + "a".repeat(500))).toBeNull();
  });
  it("rejects dot segments that normalise to a protocol-relative URL", () => {
    expect(safeRelativePath("/.//evil.com/x")).toBeNull();
    expect(safeRelativePath("/..//evil.com/x")).toBeNull();
    expect(safeRelativePath("/././/evil.com")).toBeNull();
    expect(safeRelativePath("/app/..//evil.com")).toBeNull();
    expect(safeRelativePath("/app/%2e%2e//evil.com")).toBeNull();
    expect(safeRelativePath("/app/%2E%2E//evil.com")).toBeNull();
  });
  it("still normalises harmless dot segments", () => {
    expect(safeRelativePath("/app/../admin")).toBe("/admin");
    expect(safeRelativePath("/app/./routines")).toBe("/app/routines");
  });
});

describe("singleParams (repeated query keys)", () => {
  it("keeps the first value of repeated keys", () => {
    expect(singleParams({ q: ["a", "b"], team: "x", category: undefined })).toEqual({ q: "a", team: "x", category: undefined });
  });
});

describe("isProtectedPath (proxy gate)", () => {
  it("gates app surfaces and every API route except health", () => {
    for (const p of ["/app", "/app/routines", "/admin", "/admin/users", "/super", "/super/rules", "/api/generate-routine-insight", "/api/reports/upload", "/api/super/research.csv", "/api/healthz", "/api/"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("leaves public paths alone", () => {
    for (const p of ["/", "/login", "/auth/signout", "/api/health", "/api/health/", "/api", "/appx", "/administrator"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });
});

describe("isCrossOriginWrite (route-handler CSRF guard)", () => {
  const h = (origin: string | null, fetchSite: string | null = null, host: string | null = "localhost:4000") => ({ origin, host, fetchSite });
  it("allows safe methods and same-origin writes", () => {
    expect(isCrossOriginWrite("GET", h("http://evil.example", "cross-site"))).toBe(false);
    expect(isCrossOriginWrite("POST", h("http://localhost:4000", "same-origin"))).toBe(false);
    expect(isCrossOriginWrite("POST", h(null))).toBe(false);
  });
  it("rejects cross-origin and same-site writes", () => {
    expect(isCrossOriginWrite("POST", h("http://evil.example"))).toBe(true);
    expect(isCrossOriginWrite("POST", h("http://localhost:3000"))).toBe(true);
    expect(isCrossOriginWrite("POST", h(null, "same-site"))).toBe(true);
    expect(isCrossOriginWrite("DELETE", h(null, "cross-site"))).toBe(true);
    expect(isCrossOriginWrite("POST", h("null"))).toBe(true);
    expect(isCrossOriginWrite("POST", h("not a url"))).toBe(true);
  });
});

describe("parseResearchFilters", () => {
  it("drops invalid values instead of failing", () => {
    expect(parseResearchFilters({ org: "-".repeat(36), gender: "x", category: "captain" })).toEqual({
      org: null,
      gender: null,
      category: "captain",
    });
    expect(parseResearchFilters({ org: "11111111-1111-1111-1111-111111111111", gender: "female" })).toEqual({
      org: "11111111-1111-1111-1111-111111111111",
      gender: "female",
      category: null,
    });
  });
});

describe("isLoopbackHost (https redirect exemption)", () => {
  it("matches only loopback hosts", () => {
    for (const h of ["localhost", "localhost:4000", "127.0.0.1:4000", "[::1]:4000"]) expect(isLoopbackHost(h), h).toBe(true);
    for (const h of ["demo.trycloudflare.com", "localhost.evil.com", "127.0.0.1.evil.com", "example.netlify.app"]) expect(isLoopbackHost(h), h).toBe(false);
  });
});
