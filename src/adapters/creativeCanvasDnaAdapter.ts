import { ProductVisualDNA } from '../types';

export interface DnaSummaryFormat {
  category: string;
  styles: string[];
  primaryColor: string;
  materials: string[];
  keyStructures: string[];
  lockedRulesCount: number;
}

export function mapExistingDnaResultToCanvasNode(dna: ProductVisualDNA | null | undefined): DnaSummaryFormat {
  if (!dna) {
    return {
      category: '未识别品类',
      styles: [],
      primaryColor: '未知主色',
      materials: [],
      keyStructures: [],
      lockedRulesCount: 0
    };
  }

  const category = dna.category || '家具产品';
  const styles = Array.isArray(dna.style) ? dna.style : [];
  const primaryColor = dna.primaryColor || '自然色系';
  const materials = Array.isArray(dna.materials) ? dna.materials : [];
  
  const keyStructures = Array.isArray(dna.structuralFeatures)
    ? dna.structuralFeatures.map(sf => typeof sf === 'string' ? sf : sf?.name || '').filter(Boolean)
    : [];

  const lockedRulesCount = Array.isArray(dna.lockedFeatures) ? dna.lockedFeatures.length : 0;

  return {
    category,
    styles,
    primaryColor,
    materials,
    keyStructures,
    lockedRulesCount
  };
}
