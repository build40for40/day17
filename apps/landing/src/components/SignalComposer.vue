<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { MATCH_THRESHOLD, MAX_SIGNAL_LENGTH, type Group } from 'contract'

import { matchSignal, sendSignal } from '../api'
import { isUnauthorized, messageFor } from '../errors'

const MATCH_DELAY_MS = 400
const MIN_MATCH_LENGTH = 4

const props = defineProps<{ groups: Group[] }>()
const emit = defineEmits<{ changed: []; expired: [] }>()

const composing = ref(false)
const text = ref('')
const error = ref('')
const busy = ref(false)
const scores = ref(new Map<string, number>())
const overrides = ref(new Map<string, boolean>())
const matching = ref(false)
const matchFailed = ref(false)

const remaining = computed(() => MAX_SIGNAL_LENGTH - text.value.length)
const onlyGroup = computed(() => props.groups.length === 1)

const isPicked = (id: string) => overrides.value.get(id) ?? (onlyGroup.value || (scores.value.get(id) ?? 0) >= MATCH_THRESHOLD)
const pickedIds = computed(() => props.groups.map((group) => group.household.id).filter(isPicked))
const reachText = computed(() => {
  const phones = new Set(
    props.groups
      .filter((group) => isPicked(group.household.id))
      .flatMap((group) => group.household.helpers.filter((helper) => !helper.optedOut).map((helper) => helper.phone)),
  )
  const picked = props.groups.filter((group) => isPicked(group.household.id))
  if (picked.length === 0) return ''
  const people = phones.size === 1 ? '1 person' : `${phones.size} people`
  return picked.length === 1 ? `Goes to ${people} in ${picked[0]!.household.name}` : `Goes to ${people} across ${picked.length} groups`
})
const percent = (id: string) => (scores.value.has(id) ? `${Math.round(scores.value.get(id)! * 100)}%` : '')

const hint = computed(() => {
  if (matching.value) return 'Working out who to wake up...'
  if (pickedIds.value.length > 0) return ''
  if (matchFailed.value) return "We couldn't guess the groups this time. Pick who gets this."
  if (scores.value.size > 0) return "No group looks like a match. Pick who gets this."
  return "Keep typing and we'll guess the group, or pick it yourself."
})

let timer: ReturnType<typeof setTimeout> | undefined
let latest = 0

async function match(body: string) {
  const request = ++latest
  matching.value = true
  try {
    const { matches } = await matchSignal(body)
    if (request !== latest) return
    scores.value = new Map(matches.map((found) => [found.householdId, found.score]))
    matchFailed.value = false
  } catch (e) {
    if (request !== latest) return
    scores.value = new Map()
    matchFailed.value = true
    if (isUnauthorized(e)) emit('expired')
  } finally {
    if (request === latest) matching.value = false
  }
}

watch(text, (value) => {
  clearTimeout(timer)
  if (onlyGroup.value) return
  const body = value.trim()
  if (body.length < MIN_MATCH_LENGTH) {
    latest++
    matching.value = false
    scores.value = new Map()
    return
  }
  timer = setTimeout(() => void match(body), MATCH_DELAY_MS)
})
onUnmounted(() => clearTimeout(timer))

function toggle(id: string) {
  overrides.value = new Map(overrides.value).set(id, !isPicked(id))
}

function close() {
  clearTimeout(timer)
  latest++
  composing.value = false
  text.value = ''
  error.value = ''
  matching.value = false
  matchFailed.value = false
  scores.value = new Map()
  overrides.value = new Map()
}

async function send() {
  const body = text.value.trim()
  if (!body) {
    error.value = 'Say what you need first.'
    return
  }
  if (pickedIds.value.length === 0) {
    error.value = 'Pick at least one group. A signal with nobody watching is just a lamp.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await sendSignal(pickedIds.value, body)
    close()
    emit('changed')
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card signal">
    <button v-if="!composing" class="red" type="button" data-test="red-button" @click="composing = true">
      Send the signal
    </button>

    <form v-else novalidate @submit.prevent="send">
      <label>
        What do you need?
        <textarea v-model="text" rows="3" :maxlength="MAX_SIGNAL_LENGTH" placeholder="Can anyone grab Léa at 5?" data-test="text" />
      </label>
      <div class="compose-meta">
        <p v-if="reachText" class="reach" data-test="reach">{{ reachText }}</p>
        <p class="counter" :class="{ low: remaining < 30 }" data-test="counter">{{ remaining }} left</p>
      </div>

      <fieldset v-if="!onlyGroup" class="picker">
        <legend>Who gets it</legend>
        <div class="groups">
          <button
            v-for="group in groups"
            :key="group.household.id"
            class="chip"
            :class="{ active: isPicked(group.household.id), live: group.openSignal }"
            type="button"
            :aria-pressed="isPicked(group.household.id)"
            data-test="pick-group"
            @click="toggle(group.household.id)"
          >
            {{ group.household.name }}
            <span v-if="percent(group.household.id)" class="score">{{ percent(group.household.id) }}</span>
          </button>
        </div>
        <p v-if="hint" class="muted hint" aria-live="polite" data-test="hint">{{ hint }}</p>
      </fieldset>

      <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
      <div class="row">
        <button class="primary" type="submit" :disabled="busy || pickedIds.length === 0" data-test="send">Send it</button>
        <button class="link" type="button" @click="close">Cancel</button>
      </div>
    </form>
  </section>
</template>
