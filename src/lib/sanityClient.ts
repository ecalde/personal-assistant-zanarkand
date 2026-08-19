import { createClient, type SanityClient } from "@sanity/client";
import { createImageUrlBuilder, type ImageUrlBuilder } from "@sanity/image-url";

export const SANITY_API_VERSION = "2026-01-01";
export const DEFAULT_SANITY_DATASET = "production";

export type SanityPublicConfig = {
  projectId: string;
  dataset: string;
};

type PublicEnv = Record<string, string | undefined>;

function readEnv(env: PublicEnv | undefined): PublicEnv {
  if (env) return env;
  return import.meta.env as PublicEnv;
}

/**
 * Browser-safe Sanity config. Returns null when VITE_SANITY_PROJECT_ID is unset
 * so the cooking UI can degrade to text-only cards.
 */
export function readSanityPublicConfig(env?: PublicEnv): SanityPublicConfig | null {
  const projectId = readEnv(env).VITE_SANITY_PROJECT_ID?.trim();
  if (!projectId) return null;
  const dataset = readEnv(env).VITE_SANITY_DATASET?.trim() || DEFAULT_SANITY_DATASET;
  return { projectId, dataset };
}

export function isSanityConfigured(env?: PublicEnv): boolean {
  return readSanityPublicConfig(env) !== null;
}

export function createSanityBrowserClient(config: SanityPublicConfig): SanityClient {
  return createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: SANITY_API_VERSION,
    useCdn: true,
  });
}

const publicConfig = readSanityPublicConfig();

/** Read-only CDN client. Null when Sanity env is absent. Never holds a write token. */
export const sanity: SanityClient | null = publicConfig
  ? createSanityBrowserClient(publicConfig)
  : null;

export function imageUrlFor(
  ref: { assetRef: string },
  config: SanityPublicConfig | null = readSanityPublicConfig()
): ImageUrlBuilder | null {
  if (!config) return null;
  const assetRef = ref.assetRef.trim();
  if (!assetRef) return null;
  return createImageUrlBuilder(config).image({ _ref: assetRef });
}
