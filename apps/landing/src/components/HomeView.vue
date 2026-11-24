<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_HOUSEHOLDS, type MeResponse } from 'contract'

import { deleteHousehold } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import HelpersCard from './HelpersCard.vue'
import SignalComposer from './SignalComposer.vue'
import SignalPanel from './SignalPanel.vue'

const props = defineProps<{ me: MeResponse; startAt?: string }>()
const emit = defineEmits<{ changed: []; deleted: []; expired: []; add: [] }>()

const selectedId = ref(props.startAt ?? props.me.groups[0]?.household.id ?? '')
const confirming = ref(false)
const error = ref('')

const live = computed(() => props.me.groups.filter((g) => g.openSignal))
const group = computed(() => props.me.groups.find((g) => g.household.id === selectedId.value) ?? props.me.groups[0])

// The same person can be in several of a parent's groups, matched by phone number.
const alsoIn = computed(() => {
  const map: Record<string, string[]> = {}
  for (const helper of group.value?.household.helpers ?? []) {
    const others = props.me.groups
      .filter((g) => g.household.id !== group.value?.household.id && g.household.helpers.some((h) => h.phone === helper.phone))
      .map((g) => g.household.name)
    if (others.length) map[helper.phone] = others
  }
  return map
})


watch(
  () => props.me.groups.map((g) => g.household.id),
  (ids, previous) => {
    const added = ids.find((id) => !previous.includes(id))
    if (added) selectedId.value = added
    else if (!ids.includes(selectedId.value)) selectedId.value = ids[0] ?? ''
  },
)

function select(id: string) {
  selectedId.value = id
  confirming.value = false
  error.value = ''
}

async function remove() {
  if (!group.value) return
  error.value = ''
  try {
    await deleteHousehold(group.value.household.id)
    confirming.value = false
    emit('deleted')
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  }
}
</script>

<template>
  <div v-if="group">
    <section v-if="props.me.signalNumber" class="card">
      <h3>Your number to text</h3>
      <p class="number" data-test="number">{{ props.me.signalNumber }}</p>
    </section>

    <SignalComposer :groups="props.me.groups" @changed="emit('changed')" @expired="emit('expired')" />

    <SignalPanel
      v-for="g in live"
      :key="g.household.id"
      :household-id="g.household.id"
      :group-name="props.me.groups.length > 1 ? g.household.name : undefined"
      :open-signal="g.openSignal!"
      :recipients="g.recipients"
      :reach="g.household.helpers.filter((h) => !h.optedOut).length"
      @changed="emit('changed')"
      @expired="emit('expired')"
    />

    <nav class="groups" aria-label="Your groups">
      <template v-if="props.me.groups.length > 1">
        <button
          v-for="g in props.me.groups"
          :key="g.household.id"
          class="chip"
          :class="{ active: g.household.id === group.household.id, live: g.openSignal }"
          type="button"
          :aria-pressed="g.household.id === group.household.id"
          data-test="group-tab"
          @click="select(g.household.id)"
        >
          {{ g.household.name }}
        </button>
      </template>
      <button
        v-if="props.me.groups.length < MAX_HOUSEHOLDS"
        class="chip add"
        type="button"
        data-test="add-group"
        @click="emit('add')"
      >
        + New group
      </button>
    </nav>

    <h2 class="group" data-test="group-name">{{ group.household.name }}</h2>
    <p v-if="group.household.description" class="muted" data-test="group-description">{{ group.household.description }}</p>

    <HelpersCard
      :key="group.household.id"
      :household="group.household"
      :also-in="alsoIn"
      @changed="emit('changed')"
      @expired="emit('expired')"
    />

    <section v-if="props.me.groups.length > 1" class="card" data-test="overview">
      <h3>Who's in which group</h3>
      <ul class="overview">
        <li v-for="g in props.me.groups" :key="g.household.id" data-test="overview-group">
          <button
            class="link"
            type="button"
            :aria-current="g.household.id === group.household.id ? 'true' : undefined"
            @click="select(g.household.id)"
          >
            {{ g.household.name }}
          </button>
          <span class="muted">
            {{ g.household.helpers.length ? g.household.helpers.map((h) => h.name).join(', ') : 'Nobody yet' }}
          </span>
        </li>
      </ul>
    </section>

    <section class="danger">
      <button v-if="!confirming" class="link quiet" type="button" data-test="delete" @click="confirming = true">
        Delete {{ props.me.groups.length > 1 ? `"${group.household.name}"` : 'my group' }} and all its data
      </button>
      <div v-else>
        <p>This wipes {{ group.household.name }}, its helpers and every message. It can't be undone.</p>
        <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
        <div class="row">
          <button class="danger-btn" type="button" data-test="confirm-delete" @click="remove">Yes, delete it all</button>
          <button class="link" type="button" @click="confirming = false">Keep it</button>
        </div>
      </div>
    </section>
  </div>
</template>
