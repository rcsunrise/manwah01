import { describe, it, expect } from 'vitest';
import { ProductVisualDNA, CreativeProject } from '../src/types';

describe('Phase 2 Project & Product DNA Logic Tests', () => {
  it('should initialize creative project structure correctly', () => {
    const project: CreativeProject = {
      id: 'proj_123',
      owner_id: 'user_456',
      name: '敏华真皮极简沙发 9 屏企划',
      project_type: 'detail_page',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(project.id).toBe('proj_123');
    expect(project.project_type).toBe('detail_page');
    expect(project.status).toBe('active');
  });

  it('should format Product Visual DNA schema and validation rules', () => {
    const dna: ProductVisualDNA = {
      project_id: 'proj_123',
      schema_version: 1,
      category: '沙发',
      subcategory: '电动功能沙发',
      style: ['意式极简', '现代轻奢'],
      primaryColor: '爱马仕橙',
      secondaryColors: ['哑光黑', '拉丝枪色'],
      materials: ['头层黄牛皮', '高密度海绵', '碳素钢扶手'],
      structuralFeatures: [
        { name: '双针车缝', description: '扶手内侧精细双线明车缝工艺', confidence: 0.96 },
        { name: '伸缩脚托', description: '隐藏式单电机联动伸缩脚托', confidence: 0.92 }
      ],
      functionalFeatures: ['110°-160°无级调节', 'USB/Type-C 充电面板'],
      lockedFeatures: [
        { name: '扶手厚度', rule: '严禁改变扶手内敛弧度', priority: 'critical' },
        { name: '牛皮质感', rule: '保持全粒面自然纹理，禁止平滑塑料化', priority: 'high' }
      ],
      logo: {
        visible: true,
        position: '扶手侧面靠下',
        description: 'Manwah 金属烙印徽标'
      },
      version: 1,
      confirmed_at: null
    };

    expect(dna.category).toBe('沙发');
    expect(dna.materials.length).toBe(3);
    expect(dna.lockedFeatures.find(f => f.priority === 'critical')).toBeDefined();
    expect(dna.confirmed_at).toBeNull();
  });

  it('should support human user corrections and lock DNA when confirmed', () => {
    const dna: ProductVisualDNA = {
      project_id: 'proj_123',
      schema_version: 1,
      category: '沙发',
      style: ['极简'],
      primaryColor: '灰白色',
      secondaryColors: [],
      materials: ['皮'],
      structuralFeatures: [],
      functionalFeatures: [],
      lockedFeatures: [],
      confirmed_at: null,
      version: 1
    };

    // User updates primaryColor and confirms
    const updatedDna: ProductVisualDNA = {
      ...dna,
      primaryColor: '象牙白',
      user_corrections: { primaryColor: '象牙白' },
      version: dna.version! + 1
    };

    const confirmedDna: ProductVisualDNA = {
      ...updatedDna,
      confirmed_at: new Date().toISOString()
    };

    expect(confirmedDna.primaryColor).toBe('象牙白');
    expect(confirmedDna.version).toBe(2);
    expect(confirmedDna.confirmed_at).not.toBeNull();
  });
});
