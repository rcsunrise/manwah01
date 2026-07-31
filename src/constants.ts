import { PHYAttribute } from './types';

export const PHY_MAPPINGS = {
  glossiness: [
    { min: 0, max: 30, text: "Matte finish, Soft diffuse reflection", label: "哑光 (Matte)" },
    { min: 31, max: 69, text: "Semi-gloss, Natural sheen", label: "丝光 (Satin)" },
    { min: 70, max: 100, text: "Silk luster, High-gloss satin", label: "高光 (High Gloss)" }
  ],
  roughness: [
    { min: 0, max: 30, text: "Smooth surface, Polished", label: "光滑 (Smooth)" },
    { min: 31, max: 69, text: "Natural texture, Grainy", label: "纹理 (Textured)" },
    { min: 70, max: 100, text: "Rough, Coarse, Rustic", label: "粗糙 (Rough)" }
  ],
  visualWeight: [
    { min: 0, max: 30, text: "Thin legs, Levitating design, Lightweight", label: "轻盈 (Light)" },
    { min: 31, max: 69, text: "Balanced proportions, Standard weight", label: "适中 (Medium)" },
    { min: 70, max: 100, text: "Floor-standing structure, Solid base, Heavy", label: "厚重 (Heavy)" }
  ]
};

export const TREND_KEYWORDS = {
  style: [
    "#极简主义 (Minimalism)", "#侘寂风 (Wabi-Sabi)", "#包豪斯 (Bauhaus)", 
    "#装饰艺术 (Art Deco)", "#中世纪现代 (Mid-Century Modern)", "#工业风 (Industrial)", 
    "#斯堪的纳维亚 (Scandinavian)", "#现代奢华 (Modern Luxury)"
  ],
  structure: [
    "#悬浮感 (Levitating)", "#折叠扶手 (Foldable Armrest)", "#建筑线条 (Architectural Lines)", 
    "#模块化 (Modular)", "#低重心 (Low Profile)", "#有机曲线 (Organic Curves)", 
    "#不对称设计 (Asymmetrical)", "#极简框架 (Minimalist Frame)"
  ],
  material: [
    "#羊羔绒 (Bouclé)", "#磨砂真皮 (Nubuck Leather)", "#岩板拼接 (Sintered Stone)", 
    "#科技布 (Tech Cloth)", "#编织纹理 (Woven Texture)", "#哑光金属 (Matte Metal)", 
    "#原木质感 (Raw Wood)", "#丝绒 (Velvet)"
  ]
};

export const DEFAULT_AEP_DATA = {
  trendScore: 0.85,
  style: "现代意式极简 (Modern Italian Minimalism)",
  l2_structure: ["利落线条 (Clean lines)", "低矮轮廓 (Low profile)"],
  l3_material: ["真皮 (Leather)", "金属点缀 (Metal accents)"],
  phy: {
    glossiness: 25,
    roughness: 45,
    visualWeight: 85
  },
  marketingCopy: "体验这款意式极简沙发的现代奢华缩影。其利落的线条和低矮的轮廓营造出宽敞的空间感，而优质的真皮软包和精致的金属点缀则增添了一丝精致感。这款沙发兼具舒适与时尚，是任何现代生活空间的完美补充。",
  marketingStory: "在繁忙的都市生活中，寻找一处静谧的港湾。这款沙发不仅仅是家具，更是你卸下疲惫、回归自我的精神角落。指尖划过温润的皮质，感受源自意大利的匠心温度，让每一次落座都成为一场与心灵的对话。",
  keywords: ["Modern Italian Minimalism", "Clean lines", "Low profile", "Leather", "Metal accents", "Matte finish", "Textured", "Heavy"]
};
