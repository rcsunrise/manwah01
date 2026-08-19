import crypto from 'crypto';
import { DetailPageScreenPlan, ProductVisualDNA } from '../../src/types';

export interface PromptCompilerInput {
  screenSnapshot: DetailPageScreenPlan;
  dna?: ProductVisualDNA | null;
  globalRules?: string[];
  referenceAssets?: Array<{ id: string; role: string; version?: number }>;
  aspectRatio?: string;
  providerCapability?: {
    supportsMask?: boolean;
    sizingMode?: string;
  };
}

export interface CompiledPromptResult {
  promptSnapshot: string;
  promptHash: string;
  referenceAssetVersionIds: string[];
  layoutReservationZones: string[];
}

/**
 * Pure function PromptCompiler for G0-2 Detail Page Screen Rendering.
 * Assembles screen snapshot, visual DNA, global shot rules, and reference asset manifests
 * into an auditable promptSnapshot and deterministic sha256 promptHash.
 *
 * NOTE: Chinese main copy is NOT baked as mandatory rendered characters into the image prompt;
 * instead, clean visual layout reservation areas (e.g., "Reserved title overlay space") are specified.
 */
export function compileScreenPrompt(input: PromptCompilerInput): CompiledPromptResult {
  const { screenSnapshot, dna, globalRules = [], referenceAssets = [], aspectRatio = '3:4' } = input;

  const category = dna?.category || '高级家具品类';
  const subcategory = dna?.subcategory || '爆款沙发';
  const style = dna?.style?.join(', ') || '极简轻奢影棚风';
  const primaryColor = dna?.primaryColor || '暖灰色';
  const secondaryColors = dna?.secondaryColors?.join(', ') || '哑光黑, 质感木纹';
  const materials = dna?.materials?.join(', ') || '头层牛皮';
  const lockedFeatures = dna?.lockedFeatures?.map(f => `${f.name}: ${f.rule}`).join('; ') || '保持材质纹理一致';

  const refManifest = referenceAssets
    .map((ref, idx) => `[Ref ${idx + 1}: ${ref.role} (Asset ID: ${ref.id}${ref.version ? ` v${ref.version}` : ''})]`)
    .join(' ');

  const referenceAssetVersionIds = referenceAssets.map(r => `${r.id}${r.version ? `_v${r.version}` : ''}`);

  const layoutReservationZones = [
    'Upper 25% negative space reserved for graphic title overlay',
    'Lower 15% clean negative space reserved for product specifications'
  ];

  const promptSections = [
    `[Global Commercial Photography Context] Professional commercial studio lighting, 8k resolution, photorealistic detail, ${category} - ${subcategory}. Style: ${style}. Color palette: primary ${primaryColor}, accents ${secondaryColors}. Key materials: ${materials}.`,
    `[DNA Rules] ${lockedFeatures}. ${globalRules.join('. ')}`,
    `[Screen ${screenSnapshot.screenIndex} - ${screenSnapshot.screenTitle}] Core theme: ${screenSnapshot.coreSellingPoint}.`,
    `[Composition & Lighting] ${screenSnapshot.visualComposition}. Lighting: ${screenSnapshot.lightingAndAtmosphere}.`,
    `[Specific Shot Direction] ${screenSnapshot.promptSuggestion}`,
    `[Layout Reservation & Typography Guidelines] ${layoutReservationZones.join('; ')}. Keep key subjects away from top/bottom text overlay zones. Clean negative space, zero distorted text artifacts.`,
    `[Aspect Ratio & Framing] Aspect ratio ${aspectRatio}. Product centered, natural contact shadows.`
  ];

  if (refManifest) {
    promptSections.push(`[Reference Assets] ${refManifest}`);
  }

  const promptSnapshot = promptSections.filter(Boolean).join('\n');

  const hashContent = [
    promptSnapshot,
    aspectRatio,
    referenceAssetVersionIds.sort().join(','),
    screenSnapshot.screenIndex,
    screenSnapshot.screenTitle
  ].join('||');

  const promptHash = crypto.createHash('sha256').update(hashContent).digest('hex');

  return {
    promptSnapshot,
    promptHash,
    referenceAssetVersionIds,
    layoutReservationZones
  };
}
