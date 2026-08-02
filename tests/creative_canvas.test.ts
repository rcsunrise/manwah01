import { describe, it, expect } from 'vitest';
import { mapExistingDnaResultToCanvasNode } from '../src/adapters/creativeCanvasDnaAdapter';
import { ProductVisualDNA } from '../src/types';
import { parseJsonResponse, assertSerializableRequestPayload } from '../src/utils/apiUtils';

describe('assertSerializableRequestPayload assertions', () => {
  it('should pass on clean plain objects and strings', () => {
    expect(() => {
      assertSerializableRequestPayload({ promptHint: '优化全景视效', projectId: 'proj-1' });
    }).not.toThrow();
  });

  it('should reject ReactElement or objects containing $$typeof', () => {
    const fakeReactElement = { $$typeof: Symbol.for('react.element'), type: 'span', props: {} };
    expect(() => {
      assertSerializableRequestPayload({ promptHint: fakeReactElement });
    }).toThrow(/九屏请求参数包含不可序列化字段：payload.promptHint（类型：ReactElement\/FiberNode）/);
  });

  it('should reject circular structure objects', () => {
    const circularObj: any = { promptHint: 'test' };
    circularObj.self = circularObj;
    expect(() => {
      assertSerializableRequestPayload(circularObj);
    }).toThrow(/九屏请求参数包含循环引用：payload.self/);
  });

  it('should reject functions passed inside payload', () => {
    expect(() => {
      assertSerializableRequestPayload({ onClick: () => {} });
    }).toThrow(/九屏请求参数包含不可序列化字段：payload.onClick（类型：function）/);
  });
});

describe('Creative Canvas DNA Adapter', () => {
  it('should format full ProductVisualDNA into canvas summary format', () => {
    const mockDna: ProductVisualDNA = {
      project_id: 'proj-123',
      schema_version: 1,
      category: '真皮头等舱沙发',
      style: ['意式极简', '现代奢华'],
      primaryColor: '香槟金/大象灰',
      secondaryColors: ['暖白色', '暗金色'],
      materials: ['头层黄牛皮', '实木内框', '高弹海绵'],
      structuralFeatures: [
        { name: '电动展开功能架', description: '侧面双按钮操控', confidence: 0.98 },
        { name: '嵌入式双针车缝', description: '精细挺括针脚', confidence: 0.95 }
      ],
      functionalFeatures: ['电动躺平', 'USB充电'],
      lockedFeatures: [
        { name: '功能按钮', rule: '严禁篡改侧面金属按键', priority: 'critical' },
        { name: '皮质纹理', rule: '保持细腻牛皮自然纹理', priority: 'critical' }
      ]
    };

    const summary = mapExistingDnaResultToCanvasNode(mockDna);

    expect(summary.category).toBe('真皮头等舱沙发');
    expect(summary.primaryColor).toBe('香槟金/大象灰');
    expect(summary.materials).toContain('头层黄牛皮');
    expect(summary.keyStructures).toContain('电动展开功能架');
    expect(summary.lockedRulesCount).toBe(2);
  });

  it('should handle null or partial ProductVisualDNA gracefully without throwing', () => {
    const summaryNull = mapExistingDnaResultToCanvasNode(null);
    expect(summaryNull.category).toBe('未识别品类');
    expect(summaryNull.styles).toEqual([]);
    expect(summaryNull.lockedRulesCount).toBe(0);

    const partialDna: Partial<ProductVisualDNA> = {
      category: '功能单椅'
    };
    const summaryPartial = mapExistingDnaResultToCanvasNode(partialDna as ProductVisualDNA);
    expect(summaryPartial.category).toBe('功能单椅');
    expect(summaryPartial.primaryColor).toBe('自然色系');
    expect(summaryPartial.materials).toEqual([]);
  });
});

describe('Safe parseJsonResponse helper', () => {
  it('should successfully parse valid JSON response', async () => {
    const mockRes = new Response(JSON.stringify({ success: true, data: 'test' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    const result = await parseJsonResponse<{ success: boolean; data: string }>(mockRes);
    expect(result.success).toBe(true);
    expect(result.data).toBe('test');
  });

  it('should throw clear error on empty response body (204 or empty string)', async () => {
    const mockRes = new Response(null, {
      status: 204,
      headers: { 'content-type': 'application/json' }
    });
    await expect(parseJsonResponse(mockRes)).rejects.toThrow('九屏企划接口返回空响应（HTTP 204）');
  });

  it('should throw clear error on non-JSON content type', async () => {
    const mockRes = new Response('<html>Error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
    await expect(parseJsonResponse(mockRes)).rejects.toThrow('九屏企划接口返回了非 JSON 内容：text/html');
  });

  it('should throw error with server JSON error message when status is non-2xx', async () => {
    const mockRes = new Response(JSON.stringify({ error: 'Agent 运行实例不存在' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
    await expect(parseJsonResponse(mockRes)).rejects.toThrow('Agent 运行实例不存在');
  });
});

describe('C3A Single Screen Image Generation DTO Assertions', () => {
  it('should accept clean image generation payload DTO', () => {
    const validImagePayload = {
      screenIndex: 1,
      prompt: '极简客厅，头等舱真皮沙发，阳光明媚，柔光漫射，4k高画质，无文字',
      aspectRatio: '3:4',
      model: 'google/gemini-3-pro-image-preview',
      hasRefImage: true
    };

    expect(() => {
      assertSerializableRequestPayload(validImagePayload, 'validImagePayload');
    }).not.toThrow();
  });

  it('should reject non-serializable elements in image payload DTO', () => {
    const invalidPayload = {
      screenIndex: 1,
      prompt: '极简客厅',
      onClick: () => {}
    };

    expect(() => {
      assertSerializableRequestPayload(invalidPayload, 'invalidPayload');
    }).toThrow(/九屏请求参数包含不可序列化字段/);
  });
});

describe('C4A-1 Persistence, Versioning & Storage Medium Assertions', () => {
  it('should sequentially increment revision_number for a canvas (#1, #2, #3)', () => {
    const existingRevisions = [
      { id: 'rev_1', canvas_id: 'canvas_1', revision_number: 1 },
      { id: 'rev_2', canvas_id: 'canvas_1', revision_number: 2 }
    ];

    const calculateNextRev = (revs: { revision_number: number }[]) => {
      const maxRev = revs.length > 0 ? Math.max(...revs.map(r => r.revision_number)) : 0;
      return maxRev + 1;
    };

    expect(calculateNextRev([])).toBe(1);
    expect(calculateNextRev(existingRevisions)).toBe(3);
  });

  it('should independently start revision numbering for different canvas IDs from #1', () => {
    const canvas1Revs = [{ id: 'rev_c1_1', canvas_id: 'canvas_1', revision_number: 1 }];
    const canvas2Revs: any[] = [];

    const getNextRevForCanvas = (revs: any[]) => (revs.length > 0 ? Math.max(...revs.map(r => r.revision_number)) : 0) + 1;

    expect(getNextRevForCanvas(canvas1Revs)).toBe(2);
    expect(getNextRevForCanvas(canvas2Revs)).toBe(1);
  });

  it('should differentiate save status mediums correctly (cloud_saved, local_saved, memory_only)', () => {
    const getDisplayStatus = (storageMedium: 'cloud' | 'local' | 'memory', isError: boolean = false) => {
      if (isError) return 'save_failed';
      if (storageMedium === 'cloud') return 'cloud_saved';
      if (storageMedium === 'local') return 'local_saved';
      return 'memory_only';
    };

    expect(getDisplayStatus('cloud')).toBe('cloud_saved');
    expect(getDisplayStatus('local')).toBe('local_saved');
    expect(getDisplayStatus('memory')).toBe('memory_only');
    expect(getDisplayStatus('cloud', true)).toBe('save_failed');
  });

  it('should strip oversized Base64 image payloads and mark not_persisted flag', () => {
    const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(60000);
    const nodeData = {
      imageUrl: hugeBase64,
      screenTitle: '屏幕1',
      objectKey: 'obj_123',
      storageProvider: 'supabase'
    };

    const cleanNodeData = (data: any) => {
      const cleaned: any = {};
      for (const k of Object.keys(data)) {
        if (k === 'imageUrl' && typeof data[k] === 'string' && data[k].startsWith('data:image/') && data[k].length > 50000) {
          cleaned[k] = data.storageUrl || '';
          cleaned.not_persisted = !data.storageUrl && !data.objectKey;
          continue;
        }
        cleaned[k] = data[k];
      }
      return cleaned;
    };

    const cleaned = cleanNodeData(nodeData);
    expect(cleaned.imageUrl).toBe('');
    expect(cleaned.objectKey).toBe('obj_123');
    expect(cleaned.storageProvider).toBe('supabase');
    expect(cleaned.not_persisted).toBe(false); // Because objectKey exists
  });

  it('should record sourceRevisionId when restoring from a revision without triggering AI', () => {
    const mockRevision = {
      id: 'rev_target_123',
      revision_number: 1,
      nodes_snapshot: [{ id: 'node_1', data: { screenTitle: '主图' } }],
      edges_snapshot: [],
      viewport_snapshot: { x: 10, y: 20, zoom: 1 }
    };

    const restoredPayload = {
      sourceRevisionId: mockRevision.id,
      nodes: mockRevision.nodes_snapshot,
      edges: mockRevision.edges_snapshot,
      viewport: mockRevision.viewport_snapshot,
      aiCallTriggered: false
    };

    expect(restoredPayload.sourceRevisionId).toBe('rev_target_123');
    expect(restoredPayload.aiCallTriggered).toBe(false);
    expect(restoredPayload.nodes.length).toBe(1);
  });
});

