<template>
  <div>
    <div class="form-control">
      <label class="label"><span class="label-text font-bold">充值码</span></label>
      <input
        class="input input-bordered"
        v-model="code"
        placeholder="请输入充值码，如：A3B2-XYZW-4F9P-2Q8R"
        @keyup.enter="handleRecharge"
      />
    </div>

    <button class="btn btn-primary w-full mt-4" :disabled="loading" @click="handleRecharge">
      <span v-if="loading" class="loading loading-spinner loading-sm"></span>
      {{ loading ? '充值中...' : '立即充值' }}
    </button>

    <div v-if="error" class="alert alert-error mt-3 text-sm">{{ error }}</div>
    <div v-if="success" class="alert alert-success mt-3 text-sm">{{ success }}</div>

    <p class="text-center text-sm text-base-content/60 mt-4">
      请联系鹏哥微信：<span class="font-bold text-primary">Peng_IP</span> 购买年卡或者获得7天试用
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { recharge } from '../services/api';

const emit = defineEmits(['recharged']);
const code = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');

async function handleRecharge() {
  if (!code.value.trim()) return;
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const data = await recharge(code.value.trim());
    success.value = `充值成功！获得 ${data.points} 积分，当前余额 ${data.balance} 积分`;
    code.value = '';
    emit('recharged', data.balance);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
