<script setup lang="ts">
import { ref } from 'vue'
import { MAX_HELPERS, MAX_NAME_LENGTH, type CreateHouseholdRequest } from 'contract'

import { createHousehold } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import { validateGroup } from '../group'
import PhoneField from './PhoneField.vue'
import lanternThumbs from '../assets/lantern-thumbs.jpg'

const props = defineProps<{ initial?: CreateHouseholdRequest; initialError?: string }>()
const emit = defineEmits<{ created: []; expired: [] }>()

const parentName = ref(props.initial?.parentName ?? '')
const householdName = ref(props.initial?.householdName ?? '')
let nextId = 0
const blankHelper = () => ({ id: nextId++, name: '', phone: '' })
const helpers = ref(
  props.initial?.helpers.length ? props.initial.helpers.map((h) => ({ id: nextId++, ...h })) : [blankHelper()],
)
const error = ref(props.initialError ?? '')
const busy = ref(false)

const addHelper = () => {
  if (helpers.value.length < MAX_HELPERS) helpers.value.push(blankHelper())
}
const removeHelper = (index: number) => helpers.value.splice(index, 1)

async function submit() {
  const result = validateGroup({ parentName: parentName.value, householdName: householdName.value, helpers: helpers.value })
  if (typeof result === 'string') {
    error.value = result
    return
  }
  error.value = ''
  busy.value = true
  try {
    await createHousehold(result)
    emit('created')
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card" novalidate @submit.prevent="submit">
    <div class="card-head">
      <img class="lantern" :src="lanternThumbs" alt="" />
      <div>
        <h2>Your heroes</h2>
        <p class="muted">Who should get the signal? We'll text each of them once to say hello and tell them they can reply STOP.</p>
      </div>
    </div>
    <label>
      Your name
      <input v-model="parentName" autocomplete="name" :maxlength="MAX_NAME_LENGTH" data-test="parent-name" />
    </label>
    <label>
      Name for the group
      <input v-model="householdName" placeholder="The Martin crew" :maxlength="MAX_NAME_LENGTH" data-test="group-name" />
    </label>

    <fieldset>
      <legend>Heroes ({{ helpers.length }} of {{ MAX_HELPERS }})</legend>
      <div v-for="(helper, index) in helpers" :key="helper.id" class="helper" data-test="helper-row">
        <input v-model="helper.name" placeholder="Name" aria-label="Hero name" :maxlength="MAX_NAME_LENGTH" />
        <PhoneField v-model="helper.phone" label="Hero phone" />
        <button class="link" type="button" aria-label="Remove hero" data-test="remove" @click="removeHelper(index)">
          Remove
        </button>
      </div>
      <button class="link" type="button" :disabled="helpers.length >= MAX_HELPERS" data-test="add" @click="addHelper">
        Add another hero
      </button>
    </fieldset>

    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Saving...' : 'Create my group' }}</button>
  </form>
</template>
