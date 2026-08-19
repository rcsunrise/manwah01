import { DetailPageScreenPlan } from '../../src/types';

export const DETAIL_PLAN_INSTRUCTIONS = `你是家具电商详情页的资深视觉策划总监。你的任务是根据产品视觉 DNA 生成可执行的九屏详情页计划。必须忠实保留产品结构、材质、颜色与已锁定规则，不得虚构未经输入确认的认证、质保年限、价格或功能。输出必须严格符合提供的 JSON Schema。`;

const screenSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    screenIndex: { type: 'integer', minimum: 1, maximum: 9 },
    screenTitle: { type: 'string' },
    coreSellingPoint: { type: 'string' },
    visualComposition: { type: 'string' },
    lightingAndAtmosphere: { type: 'string' },
    promptSuggestion: { type: 'string' },
    aspectRatio: { type: 'string' },
    lockedRules: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'screenIndex',
    'screenTitle',
    'coreSellingPoint',
    'visualComposition',
    'lightingAndAtmosphere',
    'promptSuggestion',
    'aspectRatio',
    'lockedRules'
  ]
} as const;

export const DETAIL_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themeTitle: { type: 'string' },
    targetAudience: { type: 'string' },
    overallStyle: { type: 'string' },
    screens: {
      type: 'array',
      minItems: 9,
      maxItems: 9,
      items: screenSchema
    }
  },
  required: ['themeTitle', 'targetAudience', 'overallStyle', 'screens']
} as const;

export function parseStructuredDetailPlan(text: string): {
  themeTitle: string;
  targetAudience: string;
  overallStyle: string;
  screens: DetailPageScreenPlan[];
} {
  let parsed: any;
  let cleanText = (text || '').trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    throw new TypeError('模型返回的九屏计划不是有效 JSON。');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.screens) || parsed.screens.length !== 9) {
    throw new TypeError('模型返回的九屏计划必须恰好包含 9 个分屏。');
  }

  const indexes = new Set<number>();
  for (const screen of parsed.screens) {
    const index = Number(screen?.screenIndex);
    if (!Number.isInteger(index) || index < 1 || index > 9 || indexes.has(index)) {
      throw new TypeError('九屏计划的 screenIndex 必须为不重复的 1–9。');
    }
    indexes.add(index);
    for (const key of [
      'screenTitle',
      'coreSellingPoint',
      'visualComposition',
      'lightingAndAtmosphere',
      'promptSuggestion',
      'aspectRatio'
    ]) {
      if (typeof screen[key] !== 'string' || !screen[key].trim()) {
        throw new TypeError(`九屏计划字段 ${key} 不能为空。`);
      }
    }
    if (!Array.isArray(screen.lockedRules) || screen.lockedRules.some((rule: unknown) => typeof rule !== 'string')) {
      throw new TypeError('九屏计划 lockedRules 必须为字符串数组。');
    }
  }
  parsed.screens.sort((a: any, b: any) => a.screenIndex - b.screenIndex);
  return parsed;
}
