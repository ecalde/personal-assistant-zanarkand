import { describe, expect, it } from "vitest";
import type { Recipe, SanityImageRef } from "../core/model";
import { imageUrlFor, isSanityConfigured, readSanityPublicConfig } from "./sanityClient";
import { primaryRecipeImage, recipeImageSrc } from "./sanityImageUrl";

const ASSET_REF = "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg";
const CANONICAL_URL =
  "https://cdn.sanity.io/images/abc123xy/production/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg";

const CONFIG = { projectId: "abc123xy", dataset: "production" };

function sampleRef(overrides: Partial<SanityImageRef> = {}): SanityImageRef {
  return {
    assetRef: ASSET_REF,
    url: CANONICAL_URL,
    ...overrides,
  };
}

describe("readSanityPublicConfig", () => {
  it("returns null when VITE_SANITY_PROJECT_ID is unset", () => {
    expect(readSanityPublicConfig({})).toBeNull();
    expect(readSanityPublicConfig({ VITE_SANITY_PROJECT_ID: "  " })).toBeNull();
    expect(isSanityConfigured({})).toBe(false);
  });

  it("defaults dataset to production", () => {
    expect(readSanityPublicConfig({ VITE_SANITY_PROJECT_ID: "abc123xy" })).toEqual({
      projectId: "abc123xy",
      dataset: "production",
    });
    expect(isSanityConfigured({ VITE_SANITY_PROJECT_ID: "abc123xy" })).toBe(true);
  });
});

describe("imageUrlFor", () => {
  it("returns null when Sanity is not configured", () => {
    expect(imageUrlFor(sampleRef(), null)).toBeNull();
  });

  it("builds a CDN URL from an assetRef", () => {
    const url = imageUrlFor(sampleRef(), CONFIG)?.url();
    expect(url).toContain("https://cdn.sanity.io/images/abc123xy/production/");
    expect(url).toContain("Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg");
  });

  it("applies width, height, fit, quality, and auto format transforms", () => {
    const url = imageUrlFor(sampleRef(), CONFIG)
      ?.width(480)
      .height(320)
      .fit("crop")
      .quality(70)
      .auto("format")
      .url();

    expect(url).toBeDefined();
    expect(url).toContain("w=480");
    expect(url).toContain("h=320");
    expect(url).toContain("fit=crop");
    expect(url).toContain("q=70");
    expect(url).toContain("auto=format");
  });
});

describe("recipeImageSrc", () => {
  it("uses image-url transforms when configured", () => {
    const url = recipeImageSrc(sampleRef(), "thumb", CONFIG);
    expect(url).toContain("w=480");
    expect(url).toContain("h=320");
    expect(url).toContain("fit=crop");
  });

  it("falls back to the stored URL when Sanity env is absent", () => {
    expect(recipeImageSrc(sampleRef(), "hero", null)).toBe(CANONICAL_URL);
  });

  it("returns null when there is no image", () => {
    expect(recipeImageSrc(undefined, "thumb", CONFIG)).toBeNull();
    expect(recipeImageSrc(sampleRef({ url: "  ", assetRef: " " }), "thumb", null)).toBeNull();
  });
});

describe("primaryRecipeImage", () => {
  it("prefers the hero image over gallery", () => {
    const hero = sampleRef({ alt: "hero" });
    const gallery = sampleRef({ alt: "gallery", assetRef: "image-other-100x100-jpg" });
    const recipe = { heroImage: hero, gallery: [gallery] } as Pick<Recipe, "heroImage" | "gallery">;
    expect(primaryRecipeImage(recipe)).toEqual(hero);
  });

  it("uses the first gallery image when there is no hero", () => {
    const gallery = sampleRef({ alt: "gallery" });
    expect(primaryRecipeImage({ gallery: [gallery] })).toEqual(gallery);
    expect(primaryRecipeImage({ gallery: [] })).toBeUndefined();
  });
});
