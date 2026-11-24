<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { CODE_LENGTH } from 'contract'

import { checkVerification, startVerification } from '../api'
import { errorMessages, messageFor } from '../errors'

const COOLDOWN_SECONDS = 30

const props = defineProps<{ phone: string }>()
const emit = defineEmits<{ verified: []; back: [] }>()

const code = ref('')
const error = ref('')
const busy = ref(false)
const cooldown = ref(COOLDOWN_SECONDS)

let timer: ReturnType<typeof setInterval> | undefined

function startCooldown() {
  cooldown.value = COOLDOWN_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}
startCooldown()
onBeforeUnmount(() => clearInterval(timer))

async function submit() {
  const digits = code.value.replace(/\s/g, '')
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits)) {
    error.value = errorMessages.invalid_code
    return
  }
  error.value = ''
  busy.value = true
  try {
    await checkVerification(props.phone, digits)
    emit('verified')
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}

async function resend() {
  error.value = ''
  try {
    await startVerification(props.phone)
    startCooldown()
  } catch (e) {
    error.value = messageFor(e)
  }
}
</script>

<template>
  <form class="card" novalidate @submit.prevent="submit">
    <h2>Check your texts</h2>
    <p>We texted a {{ CODE_LENGTH }} digit code to {{ phone }}.</p>
    <label>
      Code
      <input
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="CODE_LENGTH + 1"
        placeholder="123456"
        data-test="code"
      />
    </label>
    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Checking...' : 'Check code' }}</button>
    <div class="row">
      <button class="link" type="button" :disabled="cooldown > 0" data-test="resend" @click="resend">
        {{ cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the code' }}
      </button>
      <button class="link" type="button" @click="emit('back')">Wrong number?</button>
    </div>
  </form>
</template>
