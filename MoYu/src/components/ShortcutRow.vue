<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  keyName: { type: String, required: true },
  editingKey: { type: [String, Object], default: null },
  capturedAccel: { type: String, default: '' }
});
const emits = defineEmits(['start', 'confirm', 'cancel', 'clear']);

const displayValue = computed(() => {
  const editing = props.editingKey === props.keyName;
  if (editing) return props.capturedAccel || '按下组合键...';
  return props.value || '';
});

function onPrimaryClick() {
  if (props.editingKey === props.keyName) {
    emits('confirm', props.keyName);
  } else {
    emits('start', props.keyName);
  }
}

function onCancel() {
  emits('cancel');
}

function onClear() {
  emits('clear', props.keyName);
}
</script>

<template>
  <div class="shortcut-row">
    <div class="label">{{ label }}</div>
    <div class="controls">
      <el-input
        class="shortcut-input"
        :model-value="displayValue"
        :readonly="editingKey !== keyName"
        size="small"
        :clearable="editingKey === keyName && displayValue"
        @clear="onClear" />

      <el-button
        size="mini"
        type="primary"
        @click="onPrimaryClick"
        class="btn-primary">
        {{ editingKey === keyName ? '保存' : '编辑' }}
      </el-button>

      <el-button
        size="mini"
        @click="onCancel"
        :class="['btn-cancel', editingKey === keyName ? '' : 'placeholder']"
        >取消</el-button
      >
    </div>
  </div>
</template>

<style scoped>
.shortcut-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.shortcut-row .label {
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}
.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
}
.shortcut-row .shortcut-input {
  width: 180px;
  min-width: 120px;
  display: inline-flex;
}
.shortcut-row .btn-primary,
.shortcut-row .btn-cancel {
  min-width: 56px;
  padding: 4px 6px;
}
.controls .el-button,
.controls .el-button--mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  line-height: 28px;
}
.shortcut-input >>> .el-input__inner {
  height: 28px;
  padding: 4px 8px;
  box-sizing: border-box;
}
.btn-primary {
  height: 28px;
}
.btn-cancel {
  height: 28px;
}
.placeholder {
  visibility: hidden;
}
</style>
