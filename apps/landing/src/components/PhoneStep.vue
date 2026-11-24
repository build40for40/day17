<script setup lang="ts">
import { ref } from 'vue'
import { normalisePhone } from 'contract'

import { startVerification } from '../api'
import { errorMessages, messageFor } from '../errors'

const emit = defineEmits<{ sent: [phone: string] }>()

const input = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  const phone = normalisePhone(input.value)
  if (!phone) {
    error.value = errorMessages.invalid_phone
    return
  }
  error.value = ''
  busy.value = true
  try {
    await startVerification(phone)
    emit('sent', phone)
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card" novalidate @submit.prevent="submit">
    <h2>Step 1: your number</h2>
    <p>We text you a code so we know it's really you. No passwords, no accounts to remember.</p>
    <label>
      Your mobile number
      <input v-model="input" type="tel" inputmode="tel" autocomplete="tel" placeholder="07700 900123" data-test="phone" />
    </label>
    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Sending...' : 'Text me a code' }}</button>
  </form>
</template>
