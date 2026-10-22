import { afterEach, describe, expect, it, vi } from "vitest";

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (originalBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
  else process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;

  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;

  vi.resetModules();
});

describe("withBasePath", () => {
  it("keeps root deployments unprefixed", async () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.resetModules();
    const { withBasePath } = await import("./base-path");

    expect(withBasePath("/login")).toBe("/login");
    expect(withBasePath("shipments/")).toBe("/shipments/");
    expect(withBasePath("")).toBe("/");
    expect(withBasePath("https://api.exoexpress.ma/health")).toBe("https://api.exoexpress.ma/health");
    expect(withBasePath("//cdn.example.com/logo.png")).toBe("//cdn.example.com/logo.png");
  });

  it("prefixes application paths for a sub-path deployment", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/dashboard";
    vi.resetModules();
    const { withBasePath } = await import("./base-path");

    expect(withBasePath("/login")).toBe("/dashboard/login");
    expect(withBasePath("shipments/")).toBe("/dashboard/shipments/");
    expect(withBasePath("")).toBe("/dashboard");
  });

  it("never prefixes a path twice", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/dashboard";
    vi.resetModules();
    const { withBasePath } = await import("./base-path");

    expect(withBasePath("/dashboard/login")).toBe("/dashboard/login");
    expect(withBasePath("/dashboard")).toBe("/dashboard");
  });
});

describe("api configuration", () => {
  it("fails closed when no public API URL is compiled in", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
    const api = await import("./api");

    expect(api.API_IS_CONFIGURED).toBe(false);
    await expect(api.apiRequest("/api/v1/dashboard/kpis")).rejects.toMatchObject({
      code: "API_NOT_CONFIGURED"
    });
  });

  it("uses the configured public HTTPS API URL", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.exoexpress.ma";
    vi.resetModules();
    const api = await import("./api");

    expect(api.API_IS_CONFIGURED).toBe(true);
    expect(api.API_BASE_URL).toBe("https://api.exoexpress.ma");
  });
});
