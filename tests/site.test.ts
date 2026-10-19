import { describe, it, expect, afterEach } from "vitest";
import { siteUrl, absoluteUrl, siteHost } from "@/lib/site";

const ENV_KEY = "NEXT_PUBLIC_SITE_URL";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = original;
  }
});

describe("siteUrl", () => {
  it("falls back to localhost when the env var is empty or unset", () => {
    process.env[ENV_KEY] = "";
    expect(siteUrl()).toBe("http://localhost:3000");
    delete process.env[ENV_KEY];
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("adds https:// when the scheme is missing", () => {
    process.env[ENV_KEY] = "app.reclu.cl";
    expect(siteUrl()).toBe("https://app.reclu.cl");
  });

  it("strips trailing slashes", () => {
    process.env[ENV_KEY] = "https://app.reclu.cl/";
    expect(siteUrl()).toBe("https://app.reclu.cl");
    process.env[ENV_KEY] = "https://app.reclu.cl///";
    expect(siteUrl()).toBe("https://app.reclu.cl");
  });

  it("trims whitespace and keeps an explicit http://", () => {
    process.env[ENV_KEY] = "  http://localhost:3000  ";
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("joins base and path without double slashes", () => {
    process.env[ENV_KEY] = "https://app.reclu.cl";
    expect(absoluteUrl("/explore")).toBe("https://app.reclu.cl/explore");
  });

  it("prepends the slash to paths that lack it", () => {
    process.env[ENV_KEY] = "https://app.reclu.cl";
    expect(absoluteUrl("portfolio/nancy-pelosi")).toBe(
      "https://app.reclu.cl/portfolio/nancy-pelosi"
    );
  });

  it("defaults to the site root", () => {
    process.env[ENV_KEY] = "";
    expect(absoluteUrl()).toBe("http://localhost:3000/");
  });
});

describe("siteHost", () => {
  it("returns the host of the configured URL", () => {
    process.env[ENV_KEY] = "https://app.reclu.cl";
    expect(siteHost()).toBe("app.reclu.cl");
  });

  it("includes a non-default port", () => {
    process.env[ENV_KEY] = "http://localhost:3000";
    expect(siteHost()).toBe("localhost:3000");
  });
});
