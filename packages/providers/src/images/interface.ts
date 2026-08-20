/**
 * Image Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface ImageGenerateInput {
  tenantId: string;
  projectId?: string;
  prompt: string;
  dimensions?: { width: number; height: number };
  aspectRatio?: "1:1" | "16:9" | "4:5" | "9:16";
  style?: string;
}

export interface ImageResult {
  imageUrl: string;
  generationId: string;
  provider: string;
  provenance: "generated";
  width: number;
  height: number;
  format: "webp" | "png" | "jpeg";
  estimatedCostUsd: number;
  createdAt: string;
}

export interface ImageProvider {
  name: string;
  generateImage: (input: ImageGenerateInput) => Promise<ImageResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockImageProvider implements ImageProvider {
  public name = "mock_images";

  public async generateImage(input: ImageGenerateInput): Promise<ImageResult> {
    const width = input.dimensions?.width || 1200;
    const height = input.dimensions?.height || 800;

    return {
      imageUrl: `https://images.unsplash.com/photo-mock-gen?w=${width}&h=${height}`,
      generationId: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.name,
      provenance: "generated",
      width,
      height,
      format: "webp",
      estimatedCostUsd: 0.02,
      createdAt: new Date().toISOString(),
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "images",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockImageProvider = new MockImageProvider();
