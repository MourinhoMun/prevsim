
import CONFIG from '../data/projects_config.json';

// Updated: Realism & iPhone Style (Targeting: 2k, Raw, Imperfect)
// Updated: Realism & iPhone Style (Targeting: 2k, Raw, Imperfect)
const PROMPT_HEADER = "iPhone摄影风格, (全屏画面:1.5), 原始照片, 未经修饰, 真实的皮肤质感, 可见的毛孔, (皮肤微瑕疵:0.7), 业余摄影风格, 真实感强于完美, (聚焦主体:1.4), ";
const PROMPT_FOOTER = ", (真实生活背景:1.1), 手机摄影, 4:3 画面比例";

// Negative Prompt
const NEGATIVE_PROMPT = "手机外框, 手机屏幕, 拿着手机, 手机界面, 边框, 相框, 文本, 水印, 模糊, 畸变, 脸, 眼睛, 嘴巴, 鼻子, 头部, 身份特征, 完美皮肤, 磨皮, 美颜, 滤镜, 电影灯光, 影棚光, 绘画, cgi, 3d渲染, 假人, 光滑皮肤, 特效";

// Variation Pools (Realism/Casual)
const POSE_VARIATIONS = [
  "自然放松站立",
  "稍微侧身",
  "随意的姿势",
  "一只手叉腰",
  "在家自拍的姿势",
  "对着镜子自拍 (不露脸)",
  "身体略微前倾",
  "双手整理衣服",
  "直立",
  "重心偏移"
];

const LIGHTING_VARIATIONS = [
  "室内自然光",
  "窗边的日光",
  "卧室顶灯",
  "卫生间镜前灯",
  "手机闪光灯直射", // Flash is very "real"
  "阴天柔光",
  "家庭环境光",
  "普通的房间照明",
  "明亮的日光灯",
  "早晨的自然光线"
];

/**
 * Main function to generate the 20 prompts
 */
export function generatePromptSet(inputParams) {
  const { projectId, severity, clothingId, customClothingPrompt, skinId, bodyId, ageId, genderId, faceStyle, styleVariations, viewScope } = inputParams;

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
          currentHeader = "(特写:1.4), (手抓起头发:1.5), (暴露前额:1.5), " + PROMPT_HEADER;
        } else if (['nasal_synthesis', 'alar_reduction', 'nasal_base_augment', 'eye_bags', 'chin_plasty', 'mandible_reduction', 'zygoma_reduction', 'brow_ridge_augment', 'face_lift', 'forehead_augment'].includes(projectId)) {
          currentHeader = "(面部特写:1.5), (极高清细节:1.3), " + PROMPT_HEADER;
        } else {
          currentHeader = "(特写:1.3), " + PROMPT_HEADER;
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
          stage.extra_prompt, // Stage specific description
          identityBlock,
          pose,
          light,
          currentFooter
        ].join(", ");

        stagePrompts.push({ id: `${stage.id}_${i}`, prompt: promptText });
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
        // Special Use Case: Breast Augmentation & Reduction (Cartoon Mode)
        // -> Cartoon Face Filter + Real Body
        const CARTOON_FACE_PROMPT = "(头部采用3D动漫滤镜:1.5), (卡通化五官:1.4), (匿名化处理:1.3), 抖音美颜风格, 磨皮, 眼睛放大, 漫画风格人脸, (身体保持写实质感:1.5), ";
        currentHeader = CARTOON_FACE_PROMPT + baseHeader;
        currentNegative = "写实人脸, 真实五官, 身份证照片, (真人面部:1.2), " + NEGATIVE_PROMPT;
      } else if (!isFaceHairProject) {
        // Standard Body Projects: Enforce Headless
        // (Also applies to Breast Augment if faceStyle is 'headless' OR not specified)
        currentHeader = "(聚焦身体部位:1.5), (无头视角:1.6), 不露脸, 不露出人脸, " + baseHeader;
        currentNegative = "人脸, 眼睛, 侧面视角, 侧脸, (露脸:1.5), " + NEGATIVE_PROMPT;
      } else {
        // Face/Hair Projects: Focus on detail
        currentHeader = "(特写:1.3), " + baseHeader;
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
        view,
        identityBlock,
        `(${afterFeature}:1.5)`,
        pose,
        light,
        currentFooter
      ].join(", ");

      result.beforePrompts.push({ id: `b_${i}`, prompt: promptBefore });
      result.afterPrompts.push({ id: `a_${i}`, prompt: promptAfter });
      result.negativePrompt = currentNegative; // Add negative prompt to result for logging/API
    }
  }

  return result;
}
