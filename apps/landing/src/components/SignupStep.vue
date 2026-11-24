<script setup lang="ts">
import { ref } from 'vue'
import { MAX_HELPERS, MAX_NAME_LENGTH, type CreateHouseholdRequest } from 'contract'

import { startVerification } from '../api'
import { errorMessages, messageFor } from '../errors'
import { defaultGroupName, validateGroup } from '../group'
import PhoneField from './PhoneField.vue'

// One page for a new parent: who they are and who their heroes are. Nothing is saved until their
// number is confirmed, so this only texts the code and hands the group to the code step.
const emit = defineEmits<{ sent: [phone: string, group: CreateHouseholdRequest]; signIn: [] }>()

const parentName = ref('')
const phone = ref('')
const householdName = ref('')
let nextId = 0
const helpers = ref<{ id: number; name: string; phone: string }[]>([])
const error = ref('')
const busy = ref(false)

function addHelper() {
  if (helpers.value.length < MAX_HELPERS) helpers.value.push({ id: nextId++, name: '', phone: '' })
}
const removeHelper = (index: number) => helpers.value.splice(index, 1)

async function submit() {
  if (!parentName.value.trim()) {
    error.value = "Let's start with your name."
    return
  }
  if (!phone.value) {
    error.value = errorMessages.invalid_phone
    return
  }
  const group = validateGroup({
    parentName: parentName.value,
    householdName: householdName.value.trim() || defaultGroupName(parentName.value),
    helpers: helpers.value,
  })
  if (typeof group === 'string') {
    error.value = group
    return
  }
  if (group.helpers.some((h) => h.phone === phone.value)) {
    error.value = "Your own number is on the heroes list. Add the people you'd call instead."
    return
  }
  error.value = ''
  busy.value = true
  try {
    await startVerification(phone.value)
    emit('sent', phone.value, group)
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="card" novalidate data-test="signup" @submit.prevent="submit">
    <fieldset>
      <legend>About you</legend>
      <label>
        Your name
        <input v-model="parentName" autocomplete="name" :maxlength="MAX_NAME_LENGTH" placeholder="Anastasia" data-test="parent-name" />
      </label>
      <div class="field">
        <span>Your mobile number</span>
        <PhoneField v-model="phone" label="Your mobile number" autocomplete />
      </div>
      <label>
        Name for your group <span class="muted">(optional)</span>
        <input
          v-model="householdName"
          :placeholder="defaultGroupName(parentName) || 'The Martin crew'"
          :maxlength="MAX_NAME_LENGTH"
          data-test="group-name"
        />
      </label>
    </fieldset>

    <fieldset>
      <legend>Your emergency heroes</legend>
      <p class="muted">The people who get your signal. We'll text each of them once to say hello and tell them they can reply STOP.</p>
      <div v-for="(helper, index) in helpers" :key="helper.id" class="helper" data-test="helper-row">
        <div class="helper-top">
          <b>Hero {{ index + 1 }}</b>
          <button class="link quiet" type="button" :aria-label="`Remove hero ${index + 1}`" data-test="remove" @click="removeHelper(index)">
            Remove
          </button>
        </div>
        <input v-model="helper.name" placeholder="Grandma Sue" aria-label="Hero name" :maxlength="MAX_NAME_LENGTH" />
        <PhoneField v-model="helper.phone" label="Hero phone" />
      </div>
      <button class="add-hero" type="button" :disabled="helpers.length >= MAX_HELPERS" data-test="add" @click="addHelper">
        + {{ helpers.length ? 'Add another hero' : 'Add your first hero' }}
      </button>
    </fieldset>

    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Sending...' : 'Text me a code to finish' }}</button>
    <p class="muted fine">We text you a code to check it's really you. Nothing is saved and nobody is texted until you type it in.</p>
    <button class="link" type="button" data-test="sign-in" @click="emit('signIn')">Already set up? Sign in with your number</button>
  </form>
</template>
