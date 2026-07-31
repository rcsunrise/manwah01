export interface CraftVocabItem {
  category: string;
  en: string;
  zh: string;
  description: string;
}

export const CRAFT_VOCABULARY: CraftVocabItem[] = [
  // 1. 车缝线迹与表面纹理 (Stitching & Seams)
  {
    category: 'Stitching & Seams',
    en: 'Flush Contrast Topstitching',
    zh: '对比色明车缝',
    description: '平整皮面上极具张力的对比色双轨线迹。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Double-Needle Lock-Stitch',
    zh: '双针锁线缝',
    description: '平行的双重走线，多用于现代款大块面边缘。'
  },
  {
    category: 'Stitching & Seams',
    en: 'French Tailored Seam',
    zh: '法式高定缝',
    description: '双面翻折的暗缝工艺，边沿呈现极简的法式优雅。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Baseball Thick Stitching',
    zh: '粗犷棒球线迹',
    description: '极粗的交叉或V字形功能型装饰缝线。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Flanged Feather Edge',
    zh: '飞边/羽毛边缝',
    description: '皮革边沿外露并进行单侧车缝，呈现随性的轻奢感。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Welted Piping Seam',
    zh: '嵌线/滚边缝',
    description: '在两块皮料衔接处嵌入一根细皮条包裹的硬质芯线。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Raw-Edge Suture',
    zh: '毛边裸缝',
    description: '故意不收边、露出牛皮天然纤维断面的先锋手工缝制。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Mock Welt Stitching',
    zh: '假嵌线车缝',
    description: '不加内芯，纯靠车缝压出的凸起状伪嵌线。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Zig-Zag Geometric Stitch',
    zh: '人字形车缝',
    description: '常用于拼色块面交界处的Z字形功能性美饰线。'
  },
  {
    category: 'Stitching & Seams',
    en: 'Intricate Diamond Quilting',
    zh: '精致菱形绗缝',
    description: '大面积紧密交叉的几何绗缝，增强皮面硬挺度。'
  },

  // 2. 褶皱、拉点与立体成型 (Pleats & Volumetric Form)
  {
    category: 'Pleats & Volumetric Form',
    en: 'Pinch-Pleat Tailored Corners',
    zh: '捏边折角工艺',
    description: '靠背顶角处经典的“猫耳状”饱满捏边。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Organic Compression Wrinkles',
    zh: '放射状挤压褶皱',
    description: '皮料因内部羽绒饱满充填自然产生的微褶。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Classic Diamond Tufting',
    zh: '深陷菱形拉点',
    description: '经典的英伦传统拉扣，制造强烈立体深凹陷。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Square Grid Pull-ins',
    zh: '矩阵方格拉扣',
    description: '极简现代款中常见的正方形立体方块拉槽。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Horizontal Tufting Indentation',
    zh: '横向拉缝凹槽',
    description: '单线内陷的贯通长槽，用于靠背上下分区。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Vertical Channel Tufting',
    zh: '纵向琴键式拉槽',
    description: '如管风琴琴键般的长条形软包立体分块。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Blind Buttonless Tufting',
    zh: '无扣暗拉点',
    description: '表面看不见纽扣，利用内部拉带扯出的平滑凹陷。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Waterfall Rolled Edge',
    zh: '瀑布式落边',
    description: '座垫前沿无缝线包裹，如瀑布般顺滑倾泻而下。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Fine Gathering Gathers',
    zh: '均匀细碎抓褶',
    description: '常用于美式或意式扶手内侧的手工微抓褶。'
  },
  {
    category: 'Pleats & Volumetric Form',
    en: 'Pillow-Top Overlay Layering',
    zh: '叠层枕状软包',
    description: '在常规扶手或座垫上额外堆叠一层羽绒枕。'
  },

  // 3. 边沿与扶手结构 (Edges & Armrest Structures)
  {
    category: 'Edges & Armrest Structures',
    en: 'Rolled Overstuffed Armrest',
    zh: '饱满圆滚扶手',
    description: '如枕头般向外翻卷、极其厚实的功能扶手。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Embedded Wood Pillar Trim',
    zh: '圆木嵌包边',
    description: '扶手外沿完美嵌入一根垂直的实木圆柱装饰。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Track Arm Panel Tailoring',
    zh: '方正赛道扶手',
    description: '利落的直角方正扶手，侧面呈现完美的几何平板。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Knife-Edge Minimalist Border',
    zh: '刀锋极简边缘',
    description: '收边极其锋利、不带任何圆弧的扁平边沿。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Bullnose Molded Edge',
    zh: '圆浪前沿工艺',
    description: '座垫或扶手前沿呈饱满的半圆柱体结构。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Embedded Metallic Accent Strip',
    zh: '嵌入式钛金饰条',
    description: '在皮缝间天衣无缝地卡入高光金属条。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Wrapped Plinth Baseboard',
    zh: '全真皮包裹底座',
    description: '沙发最下方的木质基座全部由同色牛皮手工紧致包裹。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Inverted Pleat Side Board',
    zh: '内折侧靠板',
    description: '靠背侧沿做向内折叠的几何解构处理。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Knife-Pleat Wing Flap',
    zh: '褶边功能盖片',
    description: '外侧带有独立垂感、形似机翼的悬挂式软包片。'
  },
  {
    category: 'Edges & Armrest Structures',
    en: 'Double Piping Border',
    zh: '平行双滚边围条',
    description: '侧边框由两条平行嵌线夹住一块窄皮料构成的围条。'
  },

  // 4. 内部核心与座感控制 (Core & Density Controls)
  {
    category: 'Core & Density Controls',
    en: 'High-Resilience Volumetric Foam',
    zh: '高回弹定型绵',
    description: '提供极其挺括、不塌陷的几何体积感。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Down-Feather Layered Layering',
    zh: '层叠羽绒软包',
    description: '定型绵外包裹厚型羽绒，呈现松软的呼吸感。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Memory Foam Contour Topper',
    zh: '记忆绵顶层填充',
    description: '慢回弹表层，能随人体曲线产生柔和下陷。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Segmented Lumbar Support Cushion',
    zh: '分段式独立腰托',
    description: '靠背下方隆起的、专门承托腰椎的独立鼓包。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Multi-Density Layered Core',
    zh: '多密度分层座感',
    description: '上软中韧下硬的三层复合海绵结构。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Pocketed Spring Cushion Core',
    zh: '独立袋装弹簧包',
    description: '将席梦思级独立弹簧做进座垫核心。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Crowned Seat Surface Tension',
    zh: '鼓形饱满坐面',
    description: '中间微微隆起、四边紧致拉低的高张力坐面。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Overstuffed Backrest Plumpness',
    zh: '超充气感靠背',
    description: '内部高度充填，呈现近乎球面的饱满感。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Contoured Ergonomic Bolster',
    zh: '流线型工学侧翼',
    description: '座椅两侧像赛车桶椅一样微微隆起的包裹护翼。'
  },
  {
    category: 'Core & Density Controls',
    en: 'Molded Polyurethane Shell',
    zh: '硬质模塑聚氨酯内胆',
    description: '用于打造外壳极硬、内侧极软的单椅外壳。'
  },

  // 5. 功能五金与机械衔接 (Mechanics & Functionality)
  {
    category: 'Mechanics & Functionality',
    en: 'Zero-Wall Clearance Mechanism',
    zh: '零靠墙延伸五金',
    description: '向前平移伸展，后背无需预留离墙距离。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Active Power Recliner Extended',
    zh: '电动功能脚托完全展开',
    description: '功能位向前水平挺出后的机械状态。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Adjustable Mechanical Headrest',
    zh: '多段式活动头枕',
    description: '手动或电动可向前折叠或向上拔高的头枕。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Concealed Linkage Metal Hinge',
    zh: '隐藏式连杆铰链',
    description: '藏在皮料夹缝内部、完全不可见的机械关节。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Retractable Extension Footrest',
    zh: '两段式隐藏加长脚托',
    description: '翻折在内部、展开时可额外伸长的一节脚托。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Zero-Gravity Chassis Tracking',
    zh: '零重力太空舱轨道',
    description: '整椅向后仰倒、大腿抬高超过心脏水平线的功能底座。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Motorized Lumbar Actuator',
    zh: '电动功能活动腰托',
    description: '内部由电机驱动、可向前顶出或收回的硬质结构。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Split-Panel Mechanical Gap',
    zh: '功能位分区分割缝',
    description: '为了防夹皮、防摩擦专门预留的工业缝隙。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Floating Suspension Base',
    zh: '悬浮感功能底盘',
    description: '底盘内缩，视觉上让厚重的功能沙发像悬浮在地面上。'
  },
  {
    category: 'Mechanics & Functionality',
    en: 'Smart Integrated Cupholder',
    zh: '一体化智能杯托',
    description: '扶手上嵌入的带加热/制冷/触控面板的五金件。'
  },

  // 6. 2026-2027年功能/软体沙发前沿趋势工艺
  {
    category: '2026-2027 Future Trends',
    en: 'Dual-Motor Independent Back-Foot Linkage',
    zh: '双电机靠背脚托全独立微调机制',
    description: '靠背和脚托由两组独立电机控制，实现完全解耦的角度自由。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Invisible Smart-Touch Bio-Leather',
    zh: '皮料表面隐形触控感应',
    description: '取消实体金属按钮，直接在牛皮内侧嵌入电容感应层，摸一摸皮面即可控制功能位。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Bio-Based Mycelium Leather Upholstery',
    zh: '生物基菌丝体环保皮革包裹',
    description: '2026年最前沿的实验室环保材料，具备天然的温润亲肤感与微孔呼吸肌理。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Smart Adaptive Air-Bladder Matrix',
    zh: '智能体征自适应气囊阵列',
    description: '座垫内嵌压力传感器，根据用户坐姿自动充放气以实时对齐支撑力。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Organic Cloud-Peel Texturing',
    zh: '无张力云感天然皮革肌理工艺',
    description: '打破传统紧绷感，皮革表面做松弛化处理，呈现一种刚出炉面包般的蓬松松软。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Floating Chassis Luminescent Base',
    zh: '悬浮底盘伴随式隐形氛围拉丝',
    description: '在缩进式底盘边缘嵌入微型线性发光体，让功能椅落地产生柔和的悬浮光晕。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Zero-Gravity Deep Pod Enclosure',
    zh: '深太空零重力整椅环抱工艺',
    description: '侧靠板与靠背连成一体，倒向后方时形成一个完全隔绝外界视线私密舱。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Graphene Heating & Ventilation Integrated Seams',
    zh: '石墨烯温控一体化微孔车缝',
    description: '在对比色缝线两侧激光打出隐形微孔，集成吸风透气与秒级发热。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Dynamic Adaptive Armrest Tracking',
    zh: '随动功能伸展自适应扶手',
    description: '当沙发向后平躺时，扶手会自动向后向下延伸、并横向展宽，完美承托手臂。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Acoustic Resonance Cavity Headrest',
    zh: '回音壁一体化声学定型头枕',
    description: '头枕内嵌全景声定向声学腔体，外部用吸音透声布进行无缝拼接绗缝。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Ultra-Slim 9cm Mechanical Chassis',
    zh: '超薄9公分轻量化高载荷机芯',
    description: '打破传统功能沙发厚重笨拙的底座，机芯极限压缩，外观与传统常规高脚无异。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Seamless Magnetic Modular Snapping',
    zh: '模块化无缝磁吸拼搭衔接',
    description: '大组沙发之间取消传统卡扣，改用底部超强钕磁铁静音吸附，移动顺畅无缝。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Bio-Foam High-Damping Structural Support',
    zh: '生物基阻尼高减震绵填充',
    description: '吸震率极高的新一代填充绵，彻底消除功能电机启动时的微小震动感。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Matte Nubuck Hydrophobic Coatings',
    zh: '哑光磨砂皮超疏水纳米防护工艺',
    description: '在最难保养的磨砂皮/磨砂牛皮上做到水滴泼溅直接滑落、防污防油。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Zero-Gap Safety Linkage Seam',
    zh: '零缝隙防夹手一体化折叠脚托',
    description: '脚托展开连杆处采用专利软质防夹结构，彻底消除宠物和儿童的安全隐患。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Monolithic Sculpted Resin Shell Encapsulation',
    zh: '一体化雕刻树脂外壳包裹',
    description: '沙发后背和侧面由一整块流线型哑光树脂外壳包裹，内嵌皮革软包，形成刚柔并济的太空舱视觉。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Self-Healing Aniline Leather Suture',
    zh: '超自愈型全粒面苯胺皮手工绗缝',
    description: '顶级苯胺皮配合具有轻微弹性的特殊缝线，皮面微小划痕可通过体温揉搓自愈。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Smart Pneumatic Lumbar Curvature Flex',
    zh: '智能气动仿生腰椎曲度动态追踪',
    description: '腰托不再是死板的顶出，而是跟随人体的呼吸与轻微挪动，进行微小弧度的动态形变支撑。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Recycled Eco-Nylon Geometric Quilting',
    zh: '再生环保尼龙线几何立体绗缝',
    description: '响应低碳潮流，全车缝线采用海洋回收废弃物提炼的高强度环保线，并在局部做解构主义重叠走线。'
  },
  {
    category: '2026-2027 Future Trends',
    en: 'Anti-Microbial Copper-Infused Splicing',
    zh: '抗病毒铜纤维针织面料数码拼接',
    description: '在意式功能沙发的脖颈、手肘接触区，大面积数码无缝拼接混织了铜离子的抗病毒高定面料，兼顾视觉解构与健康。'
  }
];
