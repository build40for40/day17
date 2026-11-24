<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_SIGNAL_LENGTH, type RecipientState, type Signal, type SignalRecipient } from 'contract'

import { sendSignal, signOff, solveSignal } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import lanternAlert from '../assets/lantern-alert.jpg'
import lanternRunning from '../assets/lantern-running.jpg'
import lanternSleep from '../assets/lantern-sleep.jpg'

const props = defineProps<{
  householdId: string
  openSignal: Signal | null
  recipients: SignalRecipient[]
  groupName?: string
  reach?: number
}>()
const emit = defineEmits<{ changed: [signal: Signal | null]; expired: [] }>()

const composing = ref(false)
const text = ref('')
const error = ref('')
const busy = ref(false)

const remaining = computed(() => MAX_SIGNAL_LENGTH - text.value.length)

// Who a send will reach: everyone in this group who hasn't opted out.
const reachText = computed(() => {
  if (props.reach === undefined) return ''
  const people = props.reach === 1 ? '1 person' : `${props.reach} people`
  return props.groupName ? `Goes to ${people} in ${props.groupName}` : `Goes to ${people}`
})

const STATE_LABELS: Record<RecipientState, string> = {
  not_read: 'No reply yet',
  pending: 'Checking',
  accepted: 'Can help',
  rejected: "Can't this time",
}
const labelFor = (recipient: SignalRecipient) => (recipient.signedOff ? 'On it' : STATE_LABELS[recipient.state])
const onIt = computed(() => props.recipients.find((recipient) => recipient.signedOff))

// Asleep with nothing open, alarmed while the signal is up, running once someone's on it.
const lantern = computed(() => (!props.openSignal ? lanternSleep : onIt.value ? lanternRunning : lanternAlert))

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
  return run(async () => (await sendSignal(props.householdId, body)).signal)
}

const confirm = (personId: string) => run(async () => (await signOff(props.householdId, personId)).signal)

const solve = () =>
  run(async () => {
    await solveSignal(props.householdId)
    return null
  })
</script>

<template>
  <section class="card signal" :class="{ live: openSignal }">
    <template v-if="openSignal">
      <div class="card-head">
        <img class="lantern" :src="lantern" alt="" data-test="lantern" />
        <div>
          <p class="eyebrow" data-test="stage">{{ onIt ? `${onIt.name} is on it` : 'Signal is up' }}</p>
          <p class="ask" data-test="open-text">{{ openSignal.text }}</p>
        </div>
      </div>
      <ul v-if="recipients.length" class="replies">
        <li v-for="recipient in recipients" :key="recipient.personId" :class="recipient.signedOff ? 'on-it' : recipient.state" data-test="recipient">
          <span>{{ recipient.name }}</span>
          <span class="state">{{ labelFor(recipient) }}</span>
          <button
            v-if="recipient.state === 'accepted' && !recipient.signedOff"
            class="link"
            type="button"
            :disabled="busy"
            data-test="confirm"
            @click="confirm(recipient.personId)"
          >
            {{ onIt ? 'Switch to them' : 'Confirm' }}
          </button>
        </li>
      </ul>
      <button class="solved" type="button" :disabled="busy" data-test="solve" @click="solve">Solved</button>
    </template>

    <div v-else-if="!composing" class="card-head">
      <img class="lantern" :src="lantern" alt="" data-test="lantern" />
      <p class="muted">All quiet. Light the signal when you need your people.</p>
    </div>
    <button v-if="!openSignal && !composing" class="red" type="button" data-test="red-button" @click="composing = true">
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
      <div class="compose-meta">
        <p v-if="reachText" class="reach" data-test="reach">{{ reachText }}</p>
        <p class="counter" :class="{ low: remaining < 30 }" data-test="counter">{{ remaining }} left</p>
      </div>
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
