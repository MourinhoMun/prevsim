<script setup>
import { ref, computed, watch, onMounted, triggerRef } from "vue";
import { generatePromptSet } from "./logic/prompt_builder";
import { generateImageAPI, generateTextAPI, getBalance, autoLogin } from "./services/api";
import CONFIG from "./data/projects_config.json";
import { Wand2, Image as ImageIcon, Download, Settings, Upload, Sparkles, History as HistoryIcon, Trash2 } from "lucide-vue-next";
import ActivatePage from "./components/ActivatePage.vue";
import RechargePage from "./components/RechargePage.vue";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ── 授权状态
const isActivated = ref(!!localStorage.getItem('pengip_token'));
const balance = ref(0);
const showRecharge = ref(false);

async function refreshBalance() {
  try { const data = await getBalance(); balance.value = data.balance; }
  catch (e) { if (e.message.includes('过期') || e.message.includes('激活')) isActivated.value = false; }
}
function onActivated(newBalance) { isActivated.value = true; balance.value = newBalance; showRecharge.value = false; }
function onRecharged(newBalance) { balance.value = newBalance; showRecharge.value = false; }
function logout() { localStorage.removeItem('pengip_token'); isActivated.value = false; }
window.addEventListener('auth:logout', () => { isActivated.value = false; });

// ── 主功能状态
const projects = CONFIG.projects;
const selectedProject = ref(projects[0].id);
const selectedSeverity = ref('significant');
const selectedClothing = ref(CONFIG.clothing_options[0].id);
const selectedSkin = ref(CONFIG.demographics.skin_tones[0].id);
const selectedBody = ref(CONFIG.demographics.body_types[1].id);
const selectedAge = ref(CONFIG.demographics.ages[0].id);
const selectedGender = ref(CONFIG.demographics.genders[0].id);
const selectedBackground = ref(CONFIG.background_options[0].id);
const selectedFaceStyle = ref('headless');
const selectedViewScope = ref('local');
const customClothingText = ref('');

const isFacialProject = computed(() => [
  'jawline_chin','hair_transplant','eye_bags','mandible_reduction','zygoma_reduction',
  'brow_ridge_augment','nasal_base_augment','chin_plasty','forehead_augment','face_lift',
  'nasal_synthesis','alar_reduction'
].includes(selectedProject.value));

const referenceImageBefore = ref(null);
const referenceImageRecovery = ref(null);
const referenceImageAfter = ref(null);
const generatedSet = ref(null);
const generationLog = ref([]);
const generatingMap = ref({});
const historyList = ref([]);
const showHistory = ref(false);
const useAICreative = ref(false);
const isGeneratingText = ref(false);

const currentProject = computed(() => projects.find(p => p.id === selectedProject.value));
const availableClothing = computed(() =>
  CONFIG.clothing_options.filter(c => !c.suitable_for || c.suitable_for.includes(selectedProject.value))
);

onMounted(async () => {
  const saved = localStorage.getItem('prevsim_history');
  if (saved) { try { historyList.value = JSON.parse(saved); } catch (e) {} }
  if (isActivated.value) {
    refreshBalance();
  } else {
    // 未登录时，尝试静默复用 pengip.com 网页登录态
    const user = await autoLogin();
    if (user) {
      isActivated.value = true;
      balance.value = user.balance;
    }
  }
});

watch(historyList, v => localStorage.setItem('prevsim_history', JSON.stringify(v)), { deep: true });
watch(selectedProject, () => {
  if (!availableClothing.value.find(c => c.id === selectedClothing.value))
    selectedClothing.value = availableClothing.value[0]?.id || CONFIG.clothing_options[0].id;
  generatedSet.value = null;
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX/w; w = MAX; } }
        else { if (h > MAX) { w *= MAX/h; h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

async function handleImageUpload(event, type) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const url = await compressImage(file);
    if (type === 'before') referenceImageBefore.value = url;
    if (type === 'recovery') referenceImageRecovery.value = url;
    if (type === 'after') referenceImageAfter.value = url;
  } catch (e) { alert('图片处理失败，请重试'); }
  event.target.value = '';
}

function removeImage(type) {
  if (type === 'before') referenceImageBefore.value = null;
  if (type === 'recovery') referenceImageRecovery.value = null;
  if (type === 'after') referenceImageAfter.value = null;
}

async function handleGeneratePrompts() {
  let styleVariations = [];
  if (useAICreative.value) {
    isGeneratingText.value = true;
    try {
      const sys = 'You are a creative director for a medical case study photography project. Generate 10 diverse, ultra-realistic "Atmosphere & Texture" descriptions. Style: Amateur iPhone photography, raw, unedited. NO Identity mentions. Return a raw JSON array of 10 strings. No markdown.';
      const raw = await generateTextAPI(sys, 'Generate 10 style variations now.');
      const m = raw.match(/\[[\s\S]*\]/);
      styleVariations = JSON.parse(m ? m[0] : raw.replace(/```json|```/g, '').trim());
      if (!Array.isArray(styleVariations) || styleVariations.length < 5) throw new Error('Invalid array');
      balance.value = Math.max(0, balance.value - 1);
    } catch (e) {
      alert('AI 风格生成失败，已切换回标准模式。\n' + e.message);
      styleVariations = [];
    } finally { isGeneratingText.value = false; }
  }
  try {
    generatedSet.value = generatePromptSet({
      projectId: selectedProject.value, severity: selectedSeverity.value,
      clothingId: selectedClothing.value,
      customClothingPrompt: selectedClothing.value === 'custom' ? customClothingText.value : '',
      skinId: selectedSkin.value, bodyId: selectedBody.value, ageId: selectedAge.value,
      genderId: selectedGender.value, backgroundId: selectedBackground.value,
      faceStyle: selectedFaceStyle.value, viewScope: selectedViewScope.value, styleVariations
    });
  } catch (e) { alert('生成出错: ' + e.message); }
}

async function generateImage(promptId, promptText, type) {
  generatingMap.value[promptId] = true;
  const isBefore = type === 'BEFORE' || type === 'stage_0';
  const isAfter = type === 'AFTER' || type === 'stage_final';
  const isRecovery = type === 'stage_recovery' || type === 'stage_14d' || type === 'stage_21d';
  const refImg = isBefore ? referenceImageBefore.value
    : isAfter ? referenceImageAfter.value
    : isRecovery ? referenceImageRecovery.value : null;

  generationLog.value.unshift({ id: Date.now(), text: `[${new Date().toLocaleTimeString()}] 开始生成 ${type} (#${promptId})...` });
  try {
    const imageUrl = await generateImageAPI(promptText, refImg, generatedSet.value.negativePrompt || '');
    balance.value = Math.max(0, balance.value - 10);
    if (type === 'BEFORE') {
      const item = generatedSet.value.beforePrompts.find(p => p.id === promptId);
      if (item) item.imageUrl = imageUrl;
    } else if (type === 'AFTER') {
      const item = generatedSet.value.afterPrompts.find(p => p.id === promptId);
      if (item) item.imageUrl = imageUrl;
    } else if (generatedSet.value.timelineStages) {
      for (const stage of generatedSet.value.timelineStages) {
        const item = stage.prompts.find(p => p.id === promptId);
        if (item) { item.imageUrl = imageUrl; break; }
      }
    }
    triggerRef(generatedSet);
    generationLog.value.unshift({ id: Date.now(), text: `✅ 生成成功: ${type} (#${promptId})` });
    historyList.value.unshift({
      id: Date.now() + Math.random(), imageUrl,
      timestamp: new Date().toLocaleString(),
      project: currentProject.value?.name_zh || selectedProject.value,
      stage: type, prompt: promptText
    });
  } catch (e) {
    generationLog.value.unshift({ id: Date.now(), text: `❌ 生成失败: ${e.message}` });
    if (e.code === 402) { showRecharge.value = true; }
    else { alert(`生成失败: ${e.message}`); }
  } finally { generatingMap.value[promptId] = false; }
}

async function downloadImage(url, filename) {
  const link = document.createElement('a');
  if (url.startsWith('http')) {
    const blob = await fetch(url).then(r => r.blob());
    link.href = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
  } else { link.href = url; }
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function sanitizeFilename(name) { return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').trim(); }

async function downloadBatch(type, stageId = null) {
  const zip = new JSZip();
  let items = [], filename = 'Batch';
  if (type === 'BEFORE') { items = generatedSet.value.beforePrompts.filter(p => p.imageUrl); filename = '术前'; }
  else if (type === 'AFTER') { items = generatedSet.value.afterPrompts.filter(p => p.imageUrl); filename = '术后'; }
  else if (type === 'STAGE' && stageId) {
    const stage = generatedSet.value.timelineStages.find(s => s.id === stageId);
    if (stage) { items = stage.prompts.filter(p => p.imageUrl); filename = sanitizeFilename(stage.name); }
  }
  if (!items.length) { alert('没有可下载的图片'); return; }
  await Promise.all(items.map(async (item, i) => {
    const blob = await fetch(item.imageUrl).then(r => r.blob());
    zip.file(`${filename}_${i+1}.png`, blob);
  }));
  saveAs(await zip.generateAsync({ type: 'blob' }), `${sanitizeFilename(generatedSet.value.projectName)}_${filename}.zip`);
}

function getStageLabel(stageId) {
  if (!stageId) return '';
  if (stageId === 'BEFORE' || stageId === 'stage_0') return '术前';
  if (stageId === 'AFTER' || stageId === 'stage_final') return '术后';
  if (stageId.includes('recovery') || stageId.includes('14d') || stageId.includes('21d')) return '康复期';
  return stageId;
}

function clearHistory() {
  if (confirm('确定要清空所有历史记录吗？')) {
    historyList.value = [];
    localStorage.removeItem('prevsim_history');
  }
}
function deleteHistoryItem(id) { historyList.value = historyList.value.filter(i => i.id !== id); }
</script>

<template>
  <!-- 未激活：显示激活页 -->
  <ActivatePage v-if="!isActivated" @activated="onActivated" />

  <!-- 已激活：主界面 -->
  <div v-else class="min-h-screen bg-base-200 p-8 font-sans">

    <!-- 充值弹窗 -->
    <dialog class="modal" :class="{'modal-open': showRecharge}">
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-lg text-error mb-2">积分不足</h3>
        <p class="text-sm text-base-content/70 mb-4">如需购买充值码，请添加鹏哥微信：<span class="font-bold text-primary">peng_ip</span></p>
        <RechargePage @recharged="onRecharged" />
        <div class="modal-action mt-0">
          <button class="btn btn-sm btn-ghost" @click="showRecharge = false">关闭</button>
        </div>
      </div>
    </dialog>

    <!-- 历史记录弹窗 -->
    <dialog class="modal" :class="{'modal-open': showHistory}">
      <div class="modal-box w-11/12 max-w-5xl h-[80vh] flex flex-col">
        <h3 class="font-bold text-lg flex items-center justify-between">
          <span>生成历史</span>
          <div class="flex gap-2">
            <span class="text-xs text-warning flex items-center" v-if="historyList.length > 5">⚠️ 本地存储容量有限，请及时下载</span>
            <button class="btn btn-xs btn-error btn-outline" @click="clearHistory" v-if="historyList.length > 0">
              <Trash2 class="w-3 h-3"/> 清空历史
            </button>
          </div>
        </h3>
        <p class="py-2 text-sm opacity-60">历史记录已启用本地自动保存。由于浏览器存储限制(约5MB)，建议生成的图片及时下载到本地。所有图像均为 AI 模拟，不含真实患者信息。</p>
        <div class="flex-1 overflow-y-auto p-2 bg-base-200 rounded-lg">
          <div v-if="historyList.length === 0" class="text-center opacity-50 mt-20">暂无历史记录</div>
          <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div v-for="h in historyList" :key="h.id" class="card bg-base-100 shadow-sm text-xs">
              <figure class="px-2 pt-2 relative group">
                <img :src="h.imageUrl" class="rounded-lg h-32 w-full object-cover cursor-pointer" @click="downloadImage(h.imageUrl, `${h.project}_${getStageLabel(h.stage)}.png`)" />
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg pointer-events-none">
                  <Download class="text-white w-6 h-6"/>
                </div>
              </figure>
              <div class="card-body p-2">
                <h2 class="font-bold truncate" :title="h.project">{{ h.project }}</h2>
                <div class="flex justify-between items-center text-[10px] opacity-70">
                  <span class="badge badge-outline badge-xs">{{ getStageLabel(h.stage) }}</span>
                  <span>{{ h.timestamp.split(' ')[1] }}</span>
                </div>
                <button class="btn btn-xs btn-ghost text-error w-full mt-1" @click="deleteHistoryItem(h.id)">删除</button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-action">
          <button class="btn" @click="showHistory = false">关闭</button>
        </div>
      </div>
    </dialog>

    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-primary flex items-center gap-2">
          <Wand2 class="w-8 h-8"/> PreVSim 术前效果模拟系统
        </h1>
        <p class="text-base-content/70">医患沟通辅助工具 · 术前预期可视化</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <div class="flex items-center gap-2">
          <span class="badge badge-outline badge-lg font-mono">积分: {{ balance }}</span>
          <button class="btn btn-sm btn-outline btn-primary" @click="showRecharge = true">充值</button>
          <button class="btn btn-sm btn-ghost gap-2" @click="showHistory = true">
            <HistoryIcon class="w-4 h-4"/> 历史 ({{ historyList.length }})
          </button>
          <button class="btn btn-sm btn-ghost text-error" @click="logout">退出</button>
        </div>
        <div class="badge badge-accent badge-lg">医患沟通</div>
        <span class="text-[10px] opacity-40 max-w-[240px] text-right leading-tight">本工具生成的图像均为 AI 模拟效果，仅用于术前医患沟通，不代表真实手术结果，不侵犯任何患者肖像权</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

      <!-- 左侧配置面板 -->
      <div class="lg:col-span-4 space-y-6">
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title text-lg mb-4 flex items-center gap-2">
              <Settings class="w-5 h-5"/> 模拟参数配置
            </h2>

            <!-- 手术项目 -->
            <div class="form-control w-full">
              <label class="label"><span class="label-text font-bold">手术项目</span></label>
              <select class="select select-bordered" v-model="selectedProject">
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name_zh }} ({{ p.name_en }})</option>
              </select>
              <p class="text-xs text-base-content/50 mt-1">{{ currentProject.description }}</p>
            </div>

            <!-- 改善程度 -->
            <div class="form-control w-full">
              <label class="label"><span class="label-text font-bold">预期改善程度</span></label>
              <div class="join w-full">
                <input class="join-item btn w-1/2" type="radio" name="severity" value="mild" aria-label="轻度改善" v-model="selectedSeverity"/>
                <input class="join-item btn w-1/2" type="radio" name="severity" value="significant" aria-label="显著改善" v-model="selectedSeverity"/>
              </div>
            </div>

            <!-- 隐私保护模式（胸部项目） -->
            <div v-if="selectedProject === 'breast_augment' || selectedProject === 'breast_reduction'" class="form-control w-full mt-4 p-3 bg-base-200 rounded-lg border border-primary/20">
              <label class="label pt-0"><span class="label-text font-bold text-primary">隐私保护模式</span></label>
              <div class="join w-full">
                <input class="join-item btn btn-sm w-1/2" type="radio" name="facestyle" value="headless" aria-label="😶 无头模式" v-model="selectedFaceStyle"/>
                <input class="join-item btn btn-sm w-1/2" type="radio" name="facestyle" value="cartoon" aria-label="🧚 漫画滤镜" v-model="selectedFaceStyle"/>
              </div>
              <p class="text-[10px] text-base-content/60 mt-2 px-1">
                {{ selectedFaceStyle === 'headless' ? '推荐：移除头部，仅保留身体，构图最安全。' : '实验性：保留头部构图，但五官强制3D动漫化以去敏。' }}
              </p>
            </div>

            <!-- 构图范围（面部项目） -->
            <div v-if="isFacialProject" class="form-control w-full mt-4 p-3 bg-base-200 rounded-lg border border-primary/20">
              <label class="label pt-0"><span class="label-text font-bold text-primary">构图范围</span></label>
              <div class="join w-full">
                <input class="join-item btn btn-sm w-1/2" type="radio" name="viewscope" value="local" aria-label="👁️ 局部特写" v-model="selectedViewScope"/>
                <input class="join-item btn btn-sm w-1/2" type="radio" name="viewscope" value="full" aria-label="👤 全脸展示" v-model="selectedViewScope"/>
              </div>
            </div>

            <div class="divider"></div>

            <!-- 人口统计 -->
            <div class="grid grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label"><span class="label-text">性别</span></label>
                <select class="select select-sm select-bordered" v-model="selectedGender">
                  <option v-for="g in CONFIG.demographics.genders" :key="g.id" :value="g.id">{{ g.name }}</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label"><span class="label-text">年龄</span></label>
                <select class="select select-sm select-bordered" v-model="selectedAge">
                  <option v-for="a in CONFIG.demographics.ages" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label"><span class="label-text">肤色</span></label>
                <select class="select select-sm select-bordered" v-model="selectedSkin">
                  <option v-for="s in CONFIG.demographics.skin_tones" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label"><span class="label-text">体型</span></label>
                <select class="select select-sm select-bordered" v-model="selectedBody">
                  <option v-for="b in CONFIG.demographics.body_types" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </div>
            </div>

            <!-- 服装 -->
            <div class="form-control w-full mt-4">
              <label class="label"><span class="label-text font-bold">服装</span></label>
              <select class="select select-bordered" v-model="selectedClothing">
                <option v-for="c in availableClothing" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <div v-if="selectedClothing === 'custom'" class="mt-2">
                <textarea class="textarea textarea-bordered w-full text-sm" rows="2"
                  placeholder="请输入自定义服装描述..." v-model="customClothingText"></textarea>
              </div>
            </div>

            <!-- 背景 -->
            <div class="form-control w-full mt-4">
              <label class="label"><span class="label-text font-bold">背景</span></label>
              <select class="select select-bordered" v-model="selectedBackground">
                <option v-for="bg in CONFIG.background_options" :key="bg.id" :value="bg.id">{{ bg.name }}</option>
              </select>
            </div>

            <div class="divider"></div>

            <!-- 参考图上传 -->
            <div class="space-y-4">
              <div class="form-control w-full">
                <label class="label"><span class="label-text font-bold text-warning">1. 术前参考图（可选）</span></label>
                <div class="border-2 border-dashed border-base-300 rounded-lg p-3 text-center cursor-pointer hover:bg-base-200 transition relative">
                  <input type="file" @change="(e) => handleImageUpload(e, 'before')" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  <div v-if="!referenceImageBefore" class="flex flex-col items-center gap-1 text-base-content/50">
                    <Upload class="w-6 h-6"/><span class="text-xs">点击上传术前参考图</span>
                  </div>
                  <div v-else class="relative group">
                    <img :src="referenceImageBefore" class="max-h-24 mx-auto rounded shadow-sm" />
                    <button @click.prevent.stop="removeImage('before')" class="btn btn-circle btn-xs btn-error absolute -top-2 -right-2 opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              </div>

              <div v-if="isFacialProject" class="form-control w-full">
                <label class="label"><span class="label-text font-bold text-info">2. 康复期参考图（可选）</span></label>
                <div class="border-2 border-dashed border-base-300 rounded-lg p-3 text-center cursor-pointer hover:bg-base-200 transition relative">
                  <input type="file" @change="(e) => handleImageUpload(e, 'recovery')" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  <div v-if="!referenceImageRecovery" class="flex flex-col items-center gap-1 text-base-content/50">
                    <Upload class="w-6 h-6"/><span class="text-xs">点击上传康复期参考图</span>
                  </div>
                  <div v-else class="relative group">
                    <img :src="referenceImageRecovery" class="max-h-24 mx-auto rounded shadow-sm" />
                    <button @click.prevent.stop="removeImage('recovery')" class="btn btn-circle btn-xs btn-error absolute -top-2 -right-2 opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              </div>

              <div class="form-control w-full">
                <label class="label"><span class="label-text font-bold text-success">{{ isFacialProject ? '3.' : '2.' }} 术后参考图（可选）</span></label>
                <div class="border-2 border-dashed border-base-300 rounded-lg p-3 text-center cursor-pointer hover:bg-base-200 transition relative">
                  <input type="file" @change="(e) => handleImageUpload(e, 'after')" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  <div v-if="!referenceImageAfter" class="flex flex-col items-center gap-1 text-base-content/50">
                    <Upload class="w-6 h-6"/><span class="text-xs">点击上传术后参考图</span>
                  </div>
                  <div v-else class="relative group">
                    <img :src="referenceImageAfter" class="max-h-24 mx-auto rounded shadow-sm" />
                    <button @click.prevent.stop="removeImage('after')" class="btn btn-circle btn-xs btn-error absolute -top-2 -right-2 opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI 风格多样化 -->
            <div class="form-control w-full mt-2 p-3 bg-gradient-to-r from-base-200 to-base-100 rounded-lg border border-purple-500/20">
              <label class="cursor-pointer label">
                <div class="flex items-center gap-2">
                  <Sparkles class="w-4 h-4 text-purple-500" :class="{'animate-pulse': useAICreative}"/>
                  <span class="label-text font-bold text-purple-700 dark:text-purple-400">AI 风格多样化</span>
                </div>
                <input type="checkbox" class="toggle toggle-secondary toggle-sm" v-model="useAICreative"/>
              </label>
              <p class="text-[10px] text-base-content/60 px-1 mt-1">开启后使用 LLM 动态生成独特光影与氛围描述，消耗 1 积分。</p>
            </div>

            <!-- 生成按钮 -->
            <div class="card-actions mt-6">
              <button class="btn btn-primary w-full shadow-lg gap-2"
                @click="handleGeneratePrompts" :disabled="isGeneratingText">
                <span v-if="isGeneratingText" class="loading loading-spinner loading-sm"></span>
                <Wand2 v-else class="w-4 h-4"/>
                {{ isGeneratingText ? '正在生成多样化风格...' : '生成模拟效果图' }}
              </button>
            </div>

            <!-- 日志 -->
            <div v-if="generationLog.length > 0" class="mt-4 p-3 bg-neutral text-neutral-content rounded-lg h-32 overflow-y-auto text-xs font-mono">
              <div v-for="log in generationLog" :key="log.id" class="mb-1">> {{ log.text }}</div>
            </div>

          </div>
        </div>
      </div>

      <!-- 右侧结果面板 -->
      <div class="lg:col-span-8">
        <div v-if="!generatedSet" class="h-full flex flex-col items-center justify-center opacity-30 min-h-[400px]">
          <ImageIcon class="w-24 h-24 mb-4"/>
          <p class="text-xl font-bold">准备就绪</p>
          <p>请配置左侧参数，然后点击"生成模拟效果图"以开始。</p>
        </div>

        <div v-else class="space-y-8">

          <!-- 时间线模式 -->
          <div v-if="generatedSet.isTimeline" class="space-y-6">
            <div v-for="stage in generatedSet.timelineStages" :key="stage.id"
              class="collapse collapse-arrow bg-base-100 shadow-md border border-base-200">
              <input type="checkbox" :checked="true" />
              <div class="collapse-title text-xl font-medium flex items-center gap-2 w-full pr-4">
                <span class="badge badge-primary badge-lg">{{ stage.name }}</span>
                <span class="text-sm opacity-50 font-normal flex-1">{{ stage.description }}</span>
                <button class="btn btn-sm btn-outline gap-1 z-50 ml-auto" @click.stop="downloadBatch('STAGE', stage.id)">
                  <Download class="w-4 h-4"/> 打包下载
                </button>
              </div>
              <div class="collapse-content">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 pt-4">
                  <div v-for="(item, idx) in stage.prompts" :key="item.id" class="card bg-base-200 shadow-sm border border-base-300">
                    <div class="card-body p-3">
                      <span class="text-xs font-bold opacity-50">#{{ idx + 1 }}</span>
                      <textarea class="textarea textarea-bordered text-xs h-40 w-full font-mono leading-tight" v-model="item.prompt"></textarea>
                      <button class="btn btn-xs btn-primary w-full gap-1"
                        :disabled="generatingMap[item.id]"
                        @click="generateImage(item.id, item.prompt, stage.id)">
                        <span v-if="generatingMap[item.id]" class="loading loading-spinner loading-xs"></span>
                        <Download v-else class="w-3 h-3"/>
                        {{ generatingMap[item.id] ? '生成中...' : '生成图片' }}
                      </button>
                      <div v-if="item.imageUrl" class="mt-2 w-full">
                        <img :src="item.imageUrl" class="w-full rounded shadow-sm cursor-zoom-in"
                          @click="downloadImage(item.imageUrl, `${sanitizeFilename(stage.name)}_${idx+1}.png`)" />
                        <button class="btn btn-xs btn-outline btn-primary w-full mt-1 gap-1"
                          @click="downloadImage(item.imageUrl, `${sanitizeFilename(stage.name)}_${idx+1}.png`)">
                          <Download class="w-3 h-3"/> 下载
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 标准模式 Before/After -->
          <div v-else class="space-y-8">
            <!-- 术前 -->
            <div>
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-2xl font-bold flex items-center gap-2 text-warning">
                  <span>术前状态 (BEFORE)</span>
                  <span class="text-sm font-normal opacity-50">对照 A</span>
                </h3>
                <button class="btn btn-sm btn-outline btn-warning gap-2" @click="downloadBatch('BEFORE')">
                  <Download class="w-4 h-4"/> 批量下载
                </button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="(item, idx) in generatedSet.beforePrompts" :key="item.id"
                  class="card bg-base-100 shadow-md border-l-4 border-warning">
                  <div class="card-body p-4">
                    <span class="badge badge-warning badge-outline">图片 {{ idx + 1 }}</span>
                    <textarea class="textarea textarea-bordered text-xs h-40 w-full font-mono leading-tight mt-2" v-model="item.prompt"></textarea>
                    <button class="btn btn-sm btn-warning w-full gap-2 mt-2"
                      :disabled="generatingMap[item.id]"
                      @click="generateImage(item.id, item.prompt, 'BEFORE')">
                      <span v-if="generatingMap[item.id]" class="loading loading-spinner loading-xs"></span>
                      <Download v-else class="w-3 h-3"/>
                      {{ generatingMap[item.id] ? '生成中...' : '生成图片' }}
                    </button>
                    <div v-if="item.imageUrl" class="mt-2 w-full">
                      <img :src="item.imageUrl" class="w-full rounded-lg shadow-sm border border-base-300" />
                      <div class="flex justify-between items-center mt-2">
                        <a :href="item.imageUrl" target="_blank" class="text-xs link link-hover opacity-50">查看大图</a>
                        <button class="btn btn-xs btn-outline btn-warning gap-1"
                          @click="downloadImage(item.imageUrl, `术前${idx+1}.png`)">
                          <Download class="w-3 h-3"/> 下载
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider">对比 transition</div>

            <!-- 术后 -->
            <div>
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-2xl font-bold flex items-center gap-2 text-success">
                  <span>术后效果 (AFTER)</span>
                  <span class="text-sm font-normal opacity-50">对照 B</span>
                </h3>
                <button class="btn btn-sm btn-outline btn-success gap-2" @click="downloadBatch('AFTER')">
                  <Download class="w-4 h-4"/> 批量下载
                </button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="(item, idx) in generatedSet.afterPrompts" :key="item.id"
                  class="card bg-base-100 shadow-md border-l-4 border-success">
                  <div class="card-body p-4">
                    <span class="badge badge-success badge-outline">图片 {{ idx + 1 }}</span>
                    <textarea class="textarea textarea-bordered text-xs h-40 w-full font-mono leading-tight mt-2" v-model="item.prompt"></textarea>
                    <button class="btn btn-sm btn-success w-full gap-2 mt-2"
                      :disabled="generatingMap[item.id]"
                      @click="generateImage(item.id, item.prompt, 'AFTER')">
                      <span v-if="generatingMap[item.id]" class="loading loading-spinner loading-xs"></span>
                      <Download v-else class="w-3 h-3"/>
                      {{ generatingMap[item.id] ? '生成中...' : '生成图片' }}
                    </button>
                    <div v-if="item.imageUrl" class="mt-2 w-full">
                      <img :src="item.imageUrl" class="w-full rounded-lg shadow-sm border border-base-300" />
                      <div class="flex justify-between items-center mt-2">
                        <a :href="item.imageUrl" target="_blank" class="text-xs link link-hover opacity-50">查看大图</a>
                        <button class="btn btn-xs btn-outline btn-success gap-1"
                          @click="downloadImage(item.imageUrl, `术后${idx+1}.png`)">
                          <Download class="w-3 h-3"/> 下载
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style>
.animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>
