import { describe, expect, it, vi } from "vitest";
import {
  handleSanityUpload,
  RECIPE_GALLERY_MAX_IMAGES,
  sanityAssetToImageRef,
  SANITY_UPLOAD_MAX_BYTES,
  validateRecipeImageFile,
  type SanityAssetUploadResult,
} from "./sanityUploadContract";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECIPE_ID = "18181818-1818-4181-8181-181818181818";

const ASSET: SanityAssetUploadResult = {
  _id: "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg",
  url: "https://cdn.sanity.io/images/abc123xy/production/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg",
  metadata: {
    lqip: "data:image/jpeg;base64,abc",
    dimensions: { width: 2000, height: 3000 },
  },
};

function jpegBytes(size = 16): Uint8Array {
  return new Uint8Array(size).fill(1);
}

describe("sanityAssetToImageRef", () => {
  it("maps a Sanity asset document to SanityImageRef", () => {
    expect(sanityAssetToImageRef(ASSET, "Carbonara")).toEqual({
      assetRef: ASSET._id,
      url: ASSET.url,
      lqip: ASSET.metadata?.lqip,
      width: 2000,
      height: 3000,
      alt: "Carbonara",
    });
  });

  it("omits optional fields when metadata is missing", () => {
    expect(sanityAssetToImageRef({ _id: ASSET._id, url: ASSET.url })).toEqual({
      assetRef: ASSET._id,
      url: ASSET.url,
    });
  });
});

describe("validateRecipeImageFile", () => {
  it("accepts a JPEG under the size cap", () => {
    expect(validateRecipeImageFile({ type: "image/jpeg", size: 1024 })).toBeNull();
  });

  it("rejects disallowed types and oversized files", () => {
    expect(validateRecipeImageFile({ type: "application/pdf", size: 1024 })).toBe(
      "Use a JPEG, PNG, WebP, or GIF image."
    );
    expect(validateRecipeImageFile({ type: "image/png", size: SANITY_UPLOAD_MAX_BYTES + 1 })).toBe(
      "Image must be 4 MB or smaller."
    );
  });
});

describe("handleSanityUpload", () => {
  it("rejects unauthenticated callers without uploading", async () => {
    const uploadAsset = vi.fn();
    const result = await handleSanityUpload(
      {
        userId: null,
        kind: "hero",
        file: { bytes: jpegBytes(), contentType: "image/jpeg", filename: "hero.jpg" },
      },
      { uploadAsset }
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Authentication required." });
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects invalid kind and missing files", async () => {
    const uploadAsset = vi.fn();
    expect(
      await handleSanityUpload(
        {
          userId: USER_ID,
          kind: "step",
          file: { bytes: jpegBytes(), contentType: "image/jpeg", filename: "hero.jpg" },
        },
        { uploadAsset }
      )
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await handleSanityUpload({ userId: USER_ID, kind: "hero", file: null }, { uploadAsset })
    ).toMatchObject({ ok: false, status: 400, error: "An image file is required." });
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("uploads through the mocked Sanity client and returns a well-formed ref", async () => {
    const uploadAsset = vi.fn().mockResolvedValue(ASSET);
    const bytes = jpegBytes(32);
    const result = await handleSanityUpload(
      {
        userId: USER_ID,
        kind: "hero",
        recipeId: RECIPE_ID,
        alt: "Plate of carbonara",
        file: { bytes, contentType: "image/jpeg", filename: "carbonara.jpg" },
      },
      { uploadAsset }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.assetRef).toBe(ASSET._id);
    expect(result.image.url).toBe(ASSET.url);
    expect(result.image.width).toBe(2000);
    expect(result.image.alt).toBe("Plate of carbonara");
    expect(uploadAsset).toHaveBeenCalledWith(bytes, {
      filename: "carbonara.jpg",
      contentType: "image/jpeg",
    });
  });

  it("maps Sanity client failures to 502", async () => {
    const uploadAsset = vi.fn().mockRejectedValue(new Error("token invalid"));
    const result = await handleSanityUpload(
      {
        userId: USER_ID,
        kind: "gallery",
        file: { bytes: jpegBytes(), contentType: "image/png", filename: "side.png" },
      },
      { uploadAsset }
    );
    expect(result).toEqual({ ok: false, status: 502, error: "token invalid" });
  });

  it("caps gallery length for the form", () => {
    expect(RECIPE_GALLERY_MAX_IMAGES).toBe(8);
  });
});
