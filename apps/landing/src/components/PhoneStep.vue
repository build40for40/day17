<script setup lang="ts">
import { ref } from 'vue'
import { startVerification } from '../api'
import { errorMessages, messageFor } from '../errors'
import PhoneField from './PhoneField.vue'

const emit = defineEmits<{ sent: [phone: string]; signUp: [] }>()

const phone = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (!phone.value) {
    error.value = errorMessages.invalid_phone
    return
  }
  error.value = ''
  busy.value = true
  try {
    await startVerification(phone.value)
    emit('sent', phone.value)
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card" novalidate @submit.prevent="submit">
    <h2>Welcome back</h2>
    <p>We text you a code so we know it's really you. No passwords, no accounts to remember.</p>
    <div class="field">
      <span>Your mobile number</span>
      <PhoneField v-model="phone" label="Your mobile number" autocomplete />
    </div>
    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Sending...' : 'Text me a code' }}</button>
    <button class="link" type="button" data-test="sign-up" @click="emit('signUp')">New here? Set up your signal</button>
  </form>
</template>
