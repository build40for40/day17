<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_SIGNAL_LENGTH, type Signal } from 'contract'

import { sendSignal, solveSignal } from '../api'
import { isUnauthorized, messageFor } from '../errors'

defineProps<{ openSignal: Signal | null }>()
const emit = defineEmits<{ changed: [signal: Signal | null]; expired: [] }>()

const composing = ref(false)
const text = ref('')
const error = ref('')
const busy = ref(false)

const remaining = computed(() => MAX_SIGNAL_LENGTH - text.value.length)

async function run(action: () => Promise<Signal | null>) {
  busy.value = true
  error.value = ''
  try {
    emit('changed', await action())
    text.value = ''
    composing.value = false
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  } finally {
    busy.value = false
  }
}

function send() {
  const body = text.value.trim()
  if (!body) {
    error.value = 'Say what you need first.'
    return
  }
  return run(async () => (await sendSignal(body)).signal)
}

const solve = () =>
  run(async () => {
    await solveSignal()
    return null
  })
</script>

<template>
  <section class="card signal" :class="{ live: openSignal }">
    <template v-if="openSignal">
      <p class="eyebrow">Signal is up</p>
      <p class="ask" data-test="open-text">{{ openSignal.text }}</p>
      <button class="solved" type="button" :disabled="busy" data-test="solve" @click="solve">Solved</button>
    </template>

    <button v-else-if="!composing" class="red" type="button" data-test="red-button" @click="composing = true">
      Send the signal
    </button>

    <button v-if="openSignal && !composing" class="link" type="button" data-test="update" @click="composing = true">
      Send an update
    </button>

    <form v-if="composing" novalidate @submit.prevent="send">
      <label>
        {{ openSignal ? 'What is the update?' : 'What do you need?' }}
        <textarea
          v-model="text"
          rows="3"
          :maxlength="MAX_SIGNAL_LENGTH"
          placeholder="Can anyone grab Léa at 5?"
          data-test="text"
        />
      </label>
      <p class="counter" :class="{ low: remaining < 30 }" data-test="counter">{{ remaining }} left</p>
      <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
      <div class="row">
        <button class="primary" type="submit" :disabled="busy" data-test="send">
          {{ openSignal ? 'Send update' : 'Send it' }}
        </button>
        <button class="link" type="button" @click="composing = false">Cancel</button>
      </div>
    </form>
    <p v-else-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
  </section>
</template>
