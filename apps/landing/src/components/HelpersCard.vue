<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_HELPERS, MAX_NAME_LENGTH, type Helper, type HelperInput, type Household } from 'contract'

import { addHelper, removeHelper } from '../api'
import { isUnauthorized, messageFor } from '../errors'
import PhoneField from './PhoneField.vue'

// alsoIn maps a helper's phone to the names of the parent's other groups they're in.
const props = defineProps<{ household: Household; alsoIn?: Record<string, string[]>; known?: HelperInput[] }>()
const emit = defineEmits<{ changed: []; expired: [] }>()

const adding = ref(false)
const name = ref('')
const phone = ref('')
const removingId = ref('')
const error = ref('')
const busy = ref(false)

const pickable = computed(() =>
  (props.known ?? []).filter((person) => !props.household.helpers.some((helper) => helper.phone === person.phone)),
)

function startAdding() {
  adding.value = true
  removingId.value = ''
  error.value = ''
}

function stopAdding() {
  adding.value = false
  name.value = ''
  phone.value = ''
  error.value = ''
}

function askToRemove(helper: Helper) {
  stopAdding()
  removingId.value = helper.id
}

async function run(action: () => Promise<unknown>, done: () => void) {
  error.value = ''
  busy.value = true
  try {
    await action()
    done()
    emit('changed')
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  } finally {
    busy.value = false
  }
}

function add() {
  const cleaned = name.value.trim()
  if (!cleaned) {
    error.value = 'They need a name.'
    return
  }
  if (!phone.value) {
    error.value = `${cleaned}'s number doesn't look like a UK mobile number. Check the digits.`
    return
  }
  const already = props.household.helpers.find((helper) => helper.phone === phone.value)
  if (already) {
    error.value = `That number is already in this group, as ${already.name}.`
    return
  }
  void run(() => addHelper(props.household.id, { name: cleaned, phone: phone.value }), stopAdding)
}

const addKnown = (person: HelperInput) => run(() => addHelper(props.household.id, person), stopAdding)

const remove = (helper: Helper) =>
  run(
    () => removeHelper(props.household.id, helper.id),
    () => (removingId.value = ''),
  )
</script>

<template>
  <section class="card">
    <h3>Your people ({{ props.household.helpers.length }} of {{ MAX_HELPERS }})</h3>
    <p v-if="props.household.helpers.length === 0" class="muted">Nobody yet. Add someone who'd come running.</p>
    <ul class="helpers">
      <li v-for="helper in props.household.helpers" :key="helper.id" data-test="helper">
        <span>{{ helper.name }}</span>
        <span class="muted">{{ helper.phone }}<template v-if="helper.optedOut"> (said STOP)</template></span>
        <span v-if="props.alsoIn?.[helper.phone]?.length" class="also-in" data-test="also-in">
          Also in {{ props.alsoIn[helper.phone]!.join(', ') }}
        </span>
        <div v-if="removingId === helper.id" class="row confirm">
          <span>Take {{ helper.name }} off the list?</span>
          <button class="danger-btn" type="button" :disabled="busy" data-test="confirm-remove-helper" @click="remove(helper)">
            Yes, remove
          </button>
          <button class="link" type="button" @click="removingId = ''">Keep</button>
        </div>
        <button
          v-else
          class="link quiet"
          type="button"
          :aria-label="`Remove ${helper.name}`"
          data-test="remove-helper"
          @click="askToRemove(helper)"
        >
          Remove
        </button>
      </li>
    </ul>

    <form v-if="adding" class="helper" novalidate data-test="add-helper-form" @submit.prevent="add">
      <p class="muted">We'll text them once to say hello.</p>
      <div v-if="pickable.length" class="known" data-test="known-people">
        <span>From your other groups</span>
        <div class="row">
          <button
            v-for="person in pickable"
            :key="person.phone"
            class="pick"
            type="button"
            :disabled="busy"
            data-test="known-person"
            @click="addKnown(person)"
          >
            + {{ person.name }}
          </button>
        </div>
        <span>Or someone new</span>
      </div>
      <input v-model="name" placeholder="Name" aria-label="Helper name" :maxlength="MAX_NAME_LENGTH" data-test="helper-name" />
      <PhoneField v-model="phone" label="Helper phone" />
      <div class="row">
        <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Adding...' : 'Add them' }}</button>
        <button class="link" type="button" @click="stopAdding">Cancel</button>
      </div>
    </form>
    <button
      v-else-if="props.household.helpers.length < MAX_HELPERS"
      class="link"
      type="button"
      data-test="add-helper"
      @click="startAdding"
    >
      + Add someone
    </button>

    <p v-if="error" class="error" role="alert" data-test="helper-error">{{ error }}</p>
  </section>
</template>
