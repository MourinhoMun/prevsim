<template>
  <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card bg-base-100 shadow-xl w-full max-w-md">
      <div class="card-body">
        <h1 class="text-2xl font-bold text-primary text-center mb-1">PreVSim</h1>
        <p class="text-center text-base-content/60 text-sm mb-6">术前效果模拟系统 · 医患沟通辅助工具</p>

        <div class="form-control">
          <label class="label"><span class="label-text font-bold">激活码 / 充值码</span></label>
          <input
            class="input input-bordered"
            v-model="code"
            placeholder="请输入激活码，如：A3B2-XYZW-4F9P-2Q8R"
            @keyup.enter="handleActivate"
          />
        </div>

        <button class="btn btn-primary w-full mt-4" :disabled="loading" @click="handleActivate">
          <span v-if="loading" class="loading loading-spinner loading-sm"></span>
          {{ loading ? '激活中...' : '激活' }}
        </button>

        <div v-if="error" class="alert alert-error mt-3 text-sm">{{ error }}</div>

        <div class="divider"></div>
        <p class="text-center text-sm text-base-content/60">
          如需获取激活码，请添加鹏哥微信：<span class="font-bold text-primary">peng_ip</span>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { activate } from '../services/api';

const emit = defineEmits(['activated']);
const code = ref('');
const loading = ref(false);
const error = ref('');

function getDeviceId() {
  let id = localStorage.getItem('prevsim_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('prevsim_device_id', id);
  }
  return id;
}

async function handleActivate() {
  if (!code.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await activate(code.value.trim(), getDeviceId());
    emit('activated', data.user.balance);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
