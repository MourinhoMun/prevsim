<template>
  <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card bg-base-100 shadow-xl w-full max-w-md">
      <div class="card-body">
        <h1 class="text-2xl font-bold text-primary text-center mb-1">PreVSim</h1>
        <p class="text-center text-base-content/60 text-sm mb-6">术前效果模拟系统 · 医患沟通辅助工具</p>

        <div v-if="checking" class="flex flex-col items-center py-6 gap-3">
          <span class="loading loading-spinner loading-md text-primary"></span>
          <p class="text-sm text-base-content/60">正在验证登录状态...</p>
        </div>

        <template v-else>
          <div class="form-control">
            <label class="label"><span class="label-text font-bold">激活码</span></label>
            <input
              class="input input-bordered"
              v-model="code"
              placeholder="请输入年卡激活码"
              @keyup.enter="handleActivate"
              autofocus
            />
          </div>

          <button class="btn btn-primary w-full mt-4" :disabled="loading" @click="handleActivate">
            <span v-if="loading" class="loading loading-spinner loading-sm"></span>
            {{ loading ? '激活中...' : '激活' }}
          </button>

          <div v-if="error" class="alert alert-error mt-3 text-sm">{{ error }}</div>

          <div class="divider"></div>
          <p class="text-center text-sm text-base-content/60">
            请联系鹏哥微信：<span class="font-bold text-primary">Peng_IP</span> 购买年卡或者获得7天试用
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { activate, autoLogin } from '../services/api';

const emit = defineEmits(['activated']);
const code = ref('');
const loading = ref(false);
const checking = ref(true);
const error = ref('');

onMounted(async () => {
  const user = await autoLogin();
  if (user) {
    emit('activated', user.balance);
  }
  checking.value = false;
});

async function handleActivate() {
  if (!code.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await activate(code.value.trim());
    emit('activated', data.user?.balance ?? 0);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
