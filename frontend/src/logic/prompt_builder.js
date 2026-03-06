
import CONFIG from '../data/projects_config.json';

// v4: 日常手机风格，去除电影感、虚化严重，增加日常自拍感
const PROMPT_HEADER = "(1024x1024高清输出:1.5), (日常手机摄影风格:1.6), (手机自拍风格:1.5), 真实手机拍摄效果, (未经修饰的真实皮肤:1.5), (可见毛孔细节:1.3), (皮肤纹理清晰:1.4), (轻微皮肤瑕疵保留:0.8), (自然肤色过渡:1.2), 日常生活记录感, (主体清晰:1.4), (背景清晰不虚化:1.2), (平凡日常感:1.5), ";
const PROMPT_FOOTER = ", 手机竖拍, 3:4画面比例, 1024px短边";

// Negative Prompt — 去除电影感、大片感、过度虚化
const NEGATIVE_PROMPT = "低分辨率, 模糊, 噪点过多, 过度锐化, 手机外框, 手机屏幕, 边框, 相框, 文字水印, logo, 畸变变形, 完美无瑕皮肤, 过度磨皮, 美颜滤镜, AI感, 塑料感皮肤, 蜡像感, 电影级布光, 影棚灯光, 绘画风格, cgi渲染, 3d建模, 假人模特, 特效合成, 过饱和色彩, HDR过度处理, (背景虚化:1.3), (景深效果:1.3), (电影感:1.4), (大片感:1.4), (专业摄影风格:1.2), (精修风格:1.2)";

// 姿势变体 — 更丰富真实的日常动作
const POSE_VARIATIONS = [
  "自然站立, 双手自然垂放, 重心均匀",
  "单手叉腰, 身体微微侧转, 放松姿态",
  "双手轻握放在腹前, 微微低头",
  "靠墙站立, 一脚微微抬起, 随意放松",
  "身体略微前倾, 双手撑在桌边",
  "转身四分之三角度, 回头看镜头",
  "双臂交叉抱胸, 自然站立",
  "一手扶着头发, 侧身站立",
  "走路中途停下的自然姿态, 步伐感",
  "坐在椅子边缘, 身体挺直, 双手放膝上"
];

// 光线变体 — 更精准的真实光线描述
const LIGHTING_VARIATIONS = [
  "窗边柔和自然侧光, 皮肤质感清晰",
  "室内顶灯直射, 轻微阴影, 真实家居感",
  "卫生间镜前灯, 正面均匀补光",
  "手机闪光灯直射, 轻微过曝, 真实自拍感",
  "阴天室外漫射光, 柔和无阴影",
  "早晨窗边暖色自然光, 皮肤暖调",
  "傍晚室内暖黄灯光, 温暖氛围",
  "办公室日光灯, 冷白光, 均匀照射",
  "商场室内混合光源, 自然真实",
  "户外树荫下散射光, 柔和自然"
];

/**
 * Main function to generate the 20 prompts
 */
export function generatePromptSet(inputParams) {
  const { projectId, severity, clothingId, customClothingPrompt, skinId, bodyId, ageId, genderId, faceStyle, styleVariations, viewScope, lockPerson } = inputParams;

  // 1. Get Project Config
  const project = CONFIG.projects.find(p => p.id === projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Get Attributes
  const clothingOpt = CONFIG.clothing_options.find(c => c.id === clothingId);
  const skinOpt = CONFIG.demographics.skin_tones.find(s => s.id === skinId);
  const bodyOpt = CONFIG.demographics.body_types.find(b => b.id === bodyId);
  const ageOpt = CONFIG.demographics.ages.find(a => a.id === ageId);
  const genderOpt = CONFIG.demographics.genders ? CONFIG.demographics.genders.find(g => g.id === genderId) : null;
  // Get Background Option
  const bgOpt = CONFIG.background_options ? CONFIG.background_options.find(b => b.id === inputParams.backgroundId) : null;

  // Handle custom clothing: use user text if 'custom' is selected, otherwise use config prompt
  const clothing = (clothingId === 'custom' && customClothingPrompt) 
    ? customClothingPrompt 
    : (clothingOpt ? clothingOpt.prompt : "");
  const skin = skinOpt ? skinOpt.prompt : "";
  const body = bodyOpt ? bodyOpt.prompt : "";
  const age = ageOpt ? ageOpt.prompt : "";
  const gender = genderOpt ? genderOpt.prompt : "女性"; // Default fallback
  const backgroundPrompt = bgOpt ? bgOpt.prompt : "";

  // 3. Assemble the "Locked" Subject Identity (Added Gender)
  const identityBlock = `${age}, ${gender}, ${skin}, ${body}, ${clothing}`;

  // 锁定人物：精细化提示词工程，把参考图人物特征逐项锁定
  const lockBlock = lockPerson !== false
    ? [
        "(与参考图为同一个人:2.0)",
        "(严格保持参考图人物的面部特征:1.9)",
        "(相同的脸型轮廓:1.7)",
        "(相同的眼睛形状和间距:1.6)",
        "(相同的鼻梁高度和鼻翼宽度:1.6)",
        "(相同的嘴唇厚度和形状:1.5)",
        "(相同的肤色和皮肤质感:1.6)",
        "(保留参考图中可见的皮肤细节和特征:1.4)",
        "(人物身份不变:1.8)",
        "不换脸, 不改变人物身份"
      ].join(", ") + ", "
    : ``;

  // 4. Get Project Specific Feature Descriptions
  const beforeFeature = project.severity_levels[severity].before;
  const afterFeature = project.severity_levels[severity].after;

  const result = {
    projectId: project.id,
    projectName: project.name_zh,
    beforePrompts: [],
    afterPrompts: [],
    negativePrompt: NEGATIVE_PROMPT
  };

  // 5. Generate Prompts (Timeline Mode vs Standard Mode)
  if (project.timeline_stages) {
    // TIMELINE MODE (e.g., Hair Transplant)
    result.isTimeline = true;
    result.timelineStages = [];

    // Iterate through each stage defined in config
    for (const stage of project.timeline_stages) {
      const stagePrompts = [];
      // Generate 5 images per stage
      for (let i = 0; i < 5; i++) {
        const pose = POSE_VARIATIONS[i % POSE_VARIATIONS.length];
        const light = (inputParams.backgroundId === 'original') ? "" : LIGHTING_VARIATIONS[i % LIGHTING_VARIATIONS.length];

        let currentHeader = "";

        if (projectId === 'hair_transplant') {
          // Avoid generating two hands; keep it as a single hand action.
          currentHeader = "(1024x1024:1.5), (单手抓起头发暴露发际线:1.6), (前额特写:1.5), (头皮毛囊细节清晰:1.4), " + PROMPT_HEADER;
        } else if (['nasal_synthesis', 'alar_reduction', 'nasal_base_augment', 'eye_bags', 'chin_plasty', 'mandible_reduction', 'zygoma_reduction', 'brow_ridge_augment', 'face_lift', 'forehead_augment'].includes(projectId)) {
          currentHeader = "(1024x1024:1.5), (面部特写:1.6), (五官细节极清晰:1.5), (皮肤纹理毛孔可见:1.4), (自然面部光影:1.3), " + PROMPT_HEADER;
        } else {
          currentHeader = "(1024x1024:1.5), (身体部位特写:1.4), (皮肤质感真实:1.4), " + PROMPT_HEADER;
        }

        // Dynamic Footer
        let currentFooter = "";
        if (backgroundPrompt) {
          currentFooter = `, ${backgroundPrompt}, 手机摄影, 3:4 画面比例`;
        } else {
          currentFooter = ", 手机摄影, 3:4 画面比例";
        }

        const promptText = [
          currentHeader,
          lockBlock,
          stage.extra_prompt, // Stage specific description
          identityBlock,
          pose,
          light,
          currentFooter
        ].join(", ");

        stagePrompts.push({
          id: `${stage.id}_${i}`,
          prompt: promptText,
          meta: { pose, light: light || '参考图光线' }
        });
      }
      result.timelineStages.push({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        prompts: stagePrompts
      });
    }

  } else {
    // STANDARD MODE (Before/After)
    for (let i = 0; i < 10; i++) {
      const pose = POSE_VARIATIONS[i % POSE_VARIATIONS.length];
      // If solid background is chosen, lighting should match studio style (or be simpler), but our current variations are okay.
      // If "original" background is chosen, suppress specific lighting prompts to let reference image dictate lighting & context.
      let light = LIGHTING_VARIATIONS[i % LIGHTING_VARIATIONS.length];
      if (inputParams.backgroundId === 'original') {
        light = "";
      }
      let viewList = project.views;

      // Facial Projects List
      const FACIAL_PROJECTS = [
        'jawline_chin', 'hair_transplant', 'eye_bags',
        'mandible_reduction', 'zygoma_reduction', 'brow_ridge_augment',
        'nasal_base_augment', 'chin_plasty', 'forehead_augment', 'face_lift'
      ];

      // Generic Full Face Views override
      if (FACIAL_PROJECTS.includes(projectId) && viewScope === 'full') {
        viewList = [
          "正面全脸 (Full Face Front)",
          "45度全脸 (45-degree Full Face)",
          "微微仰视全脸 (Slight Upward Full Face)",
          "正面平视 (Eye Level Full Face)",
          "略微侧脸 (Stepside Full Face)"
        ];
      }
      const view = viewList[i % viewList.length];

      // Determine constraints based on project type
      // Body projects (not jawline or hair) need strict headless/no-side/body-focus rules.
      const isFaceHairProject = FACIAL_PROJECTS.includes(projectId);

      let baseHeader = PROMPT_HEADER;
      if (styleVariations && styleVariations.length > 0) {
        // Use LLM generated style instead of static header
        baseHeader = styleVariations[i % styleVariations.length] + ", ";
      }

      let currentHeader = baseHeader;
      let currentNegative = NEGATIVE_PROMPT;

      if ((projectId === 'breast_augment' || projectId === 'breast_reduction') && faceStyle === 'cartoon') {
        const CARTOON_FACE_PROMPT = "(1024x1024:1.5), (头部采用3D动漫滤镜:1.5), (卡通化五官:1.4), (匿名化处理:1.3), 抖音美颜风格, 漫画风格人脸, (身体保持写实皮肤质感:1.6), (胸部轮廓细节清晰:1.4), ";
        currentHeader = CARTOON_FACE_PROMPT + baseHeader;
        currentNegative = "写实人脸, 真实五官, 身份证照片, (真人面部:1.2), " + NEGATIVE_PROMPT;
      } else if (!isFaceHairProject) {
        // 身体项目：无头视角，强调皮肤质感和身体轮廓细节
        currentHeader = "(1024x1024:1.5), (聚焦身体目标部位:1.6), (无头视角:1.7), 不露脸, (皮肤质感真实可见:1.5), (身体轮廓线条清晰:1.4), (自然体态:1.3), " + baseHeader;
        currentNegative = "人脸, 眼睛, 侧面视角, 侧脸, (露脸:1.5), " + NEGATIVE_PROMPT;
      } else {
        // 面部/发际线项目：高清特写，五官细节
        currentHeader = "(1024x1024:1.5), (面部特写:1.5), (五官细节清晰:1.5), (皮肤毛孔纹理可见:1.4), (自然面部光影:1.3), " + baseHeader;
      }

      // Surgery-specific constraints
      if (projectId === 'double_eyelid') {
        // Avoid unintended under-eye edits when simulating eyelids.
        currentHeader = currentHeader + "(仅改变上眼睑褶皱/上睑形态:1.6), (禁止改变下眼睑/眼袋/泪沟/黑眼圈/卧蚕:1.7), (保持下眼睑纹理与体积不变:1.6), ";
        // Recovery stage: allow realistic early post-op signs on upper eyelids only.
        if (stage && (stage.id === 'recovery' || stage.id === 'stage_recovery')) {
          currentHeader = currentHeader + "(术后恢复期表现: 轻度肿胀/淤青/红肿/贴胶布，真实自然:1.5), (非最终效果:1.4), ";
        }
        currentNegative = "祛眼袋, 眼袋消失, 下眼睑变平滑, 泪沟消失, 黑眼圈消失, 卧蚕变大, 夸张双眼皮, 网红双眼皮, 美颜, 皮肤磨皮, 大眼, 动漫眼, " + currentNegative;
      }

      // Dynamic Footer logic
      let currentFooter = "";
      if (backgroundPrompt) {
        // Explicit background chosen
        currentFooter = `, ${backgroundPrompt}, 手机摄影, 3:4 画面比例`;
      } else {
        // "Original" or no background selected. 
        // User Request: Remove background description if original/same as ref.
        // So we ONLY keep the technical tags, removing "(真实生活背景:1.1)".
        currentFooter = ", 手机摄影, 3:4 画面比例";
      }

      // Construct Before Prompt
      const promptBefore = [
        currentHeader,
        lockBlock,
        view,
        identityBlock,
        `(${beforeFeature}:1.5)`,
        pose,
        light,
        currentFooter
      ].join(", ");

      // Construct After Prompt
      const promptAfter = [
        currentHeader,
        lockBlock,
        view,
        identityBlock,
        `(${afterFeature}:1.5)`,
        pose,
        light,
        currentFooter
      ].join(", ");

      result.beforePrompts.push({
        id: `b_${i}`,
        prompt: promptBefore,
        meta: { view, pose, light: light || '参考图光线', feature: beforeFeature }
      });
      result.afterPrompts.push({
        id: `a_${i}`,
        prompt: promptAfter,
        meta: { view, pose, light: light || '参考图光线', feature: afterFeature }
      });
      result.negativePrompt = currentNegative; // Add negative prompt to result for logging/API
    }
  }

  return result;
}
