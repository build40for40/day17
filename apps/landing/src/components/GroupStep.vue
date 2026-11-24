<script setup lang="ts">
import { ref } from 'vue'
import { MAX_DESCRIPTION_LENGTH, MAX_HELPERS, MAX_NAME_LENGTH, type HelperInput } from 'contract'

import { createHousehold } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import PhoneField from './PhoneField.vue'
import lanternThumbs from '../assets/lantern-thumbs.jpg'

const props = defineProps<{ knownName?: string | null }>()
const emit = defineEmits<{ created: [householdId: string]; expired: []; cancel: [] }>()

const parentName = ref(props.knownName ?? '')
const householdName = ref('')
const description = ref('')
let nextId = 0
const blankHelper = () => ({ id: nextId++, name: '', phone: '' })
const helpers = ref([blankHelper()])
const error = ref('')
const busy = ref(false)

const addHelper = () => {
  if (helpers.value.length < MAX_HELPERS) helpers.value.push(blankHelper())
}
const removeHelper = (index: number) => helpers.value.splice(index, 1)

function validate(): { helpers: HelperInput[] } | string {
  if (!parentName.value.trim() || !householdName.value.trim()) return 'Tell us your name and a name for the group.'
  if (!description.value.trim()) return 'Say what the group is for, so we can tell which asks belong to it.'
  if (helpers.value.length === 0) return 'Add at least one helper. A bat signal needs someone to see it.'
  const cleaned: HelperInput[] = []
  for (const helper of helpers.value) {
    const name = helper.name.trim()
    if (!name) return 'Every helper needs a name.'
    if (!helper.phone) return `${name}'s number doesn't look like a phone number. Check the country code and the digits.`
    cleaned.push({ name, phone: helper.phone })
  }
  if (new Set(cleaned.map((h) => h.phone)).size !== cleaned.length) return 'The same number is on your list twice.'
  return { helpers: cleaned }
}

async function submit() {
  const result = validate()
  if (typeof result === 'string') {
    error.value = result
    return
  }
  error.value = ''
  busy.value = true
  try {
    const { household } = await createHousehold({
      parentName: parentName.value.trim(),
      householdName: householdName.value.trim(),
      description: description.value.trim(),
      helpers: result.helpers,
    })
    emit('created', household.id)
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
      <h2>{{ props.knownName ? 'A new group' : 'Step 3: your people' }}</h2>
    </div>
    <p>Who should get the signal? We'll text each of them once to say hello. If someone wants out, they'll ask you.</p>
    <label v-if="!props.knownName">
      Your name
      <input v-model="parentName" autocomplete="name" :maxlength="MAX_NAME_LENGTH" data-test="parent-name" />
    </label>
    <label>
      Name for the group
      <input v-model="householdName" placeholder="The Martin crew" :maxlength="MAX_NAME_LENGTH" data-test="group-name" />
    </label>
    <label>
      What is it for?
      <textarea
        v-model="description"
        rows="2"
        placeholder="Getting Léa to and from school, and looking after her when we're stuck"
        :maxlength="MAX_DESCRIPTION_LENGTH"
        data-test="group-description"
      />
      <span class="muted hint">We read this to work out which group an ask is for.</span>
    </label>

    <fieldset>
      <legend>Helpers ({{ helpers.length }} of {{ MAX_HELPERS }})</legend>
      <div v-for="(helper, index) in helpers" :key="helper.id" class="helper" data-test="helper-row">
        <input v-model="helper.name" placeholder="Name" aria-label="Helper name" :maxlength="MAX_NAME_LENGTH" />
        <PhoneField v-model="helper.phone" label="Helper phone" />
        <button class="link" type="button" aria-label="Remove helper" data-test="remove" @click="removeHelper(index)">
          Remove
        </button>
      </div>
      <button class="link" type="button" :disabled="helpers.length >= MAX_HELPERS" data-test="add" @click="addHelper">
        Add another helper
      </button>
    </fieldset>

    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <div class="row">
      <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Saving...' : 'Create my group' }}</button>
      <button v-if="props.knownName" class="link" type="button" data-test="cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
