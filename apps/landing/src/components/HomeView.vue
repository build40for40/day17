<script setup lang="ts">
import { ref } from 'vue'
import type { MeResponse, Signal } from 'contract'

import { deleteHousehold } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import SignalPanel from './SignalPanel.vue'

const props = defineProps<{ me: MeResponse }>()
const emit = defineEmits<{ signal: [signal: Signal | null]; deleted: []; expired: [] }>()

const confirming = ref(false)
const error = ref('')

async function remove() {
  error.value = ''
  try {
    await deleteHousehold()
    emit('deleted')
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  }
}
</script>

<template>
  <div v-if="props.me.household">
    <h2 class="group">{{ props.me.household.name }}</h2>

    <section class="card">
      <h3>Your number to text</h3>
      <p v-if="props.me.signalNumber" class="number" data-test="number">{{ props.me.signalNumber }}</p>
      <p v-else data-test="number-soon">
        Your signal number is on its way. Until then, the red button below does the same job.
      </p>
    </section>

    <SignalPanel
      :open-signal="props.me.openSignal"
      @changed="emit('signal', $event)"
      @expired="emit('expired')"
    />

    <section class="card">
      <h3>Your helpers</h3>
      <ul class="helpers">
        <li v-for="helper in props.me.household.helpers" :key="helper.id">
          <span>{{ helper.name }}</span>
          <span class="muted">{{ helper.phone }}<template v-if="helper.optedOut"> (said STOP)</template></span>
        </li>
      </ul>
    </section>

    <section class="danger">
      <button v-if="!confirming" class="link quiet" type="button" data-test="delete" @click="confirming = true">
        Delete my group and all its data
      </button>
      <div v-else>
        <p>This wipes your group, your helpers and every message. It can't be undone.</p>
        <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
        <div class="row">
          <button class="danger-btn" type="button" data-test="confirm-delete" @click="remove">Yes, delete it all</button>
          <button class="link" type="button" @click="confirming = false">Keep it</button>
        </div>
      </div>
    </section>
  </div>
</template>
