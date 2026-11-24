<script setup lang="ts">
import { ref } from 'vue'
import { MAX_NAME_LENGTH, type Person } from 'contract'

import { deleteMe, signOut, updateMe } from '../api'
import { isUnauthorized, messageFor } from '../errors'

const props = defineProps<{ person: Person }>()
const emit = defineEmits<{ saved: []; signedOut: []; expired: []; back: [] }>()

const name = ref(props.person.name ?? '')
const saved = ref(false)
const confirming = ref(false)
const error = ref('')
const busy = ref(false)

async function run(action: () => Promise<unknown>, done: () => void) {
  error.value = ''
  saved.value = false
  busy.value = true
  try {
    await action()
    done()
  } catch (e) {
    error.value = messageFor(e)
    if (isUnauthorized(e)) emit('expired')
  } finally {
    busy.value = false
  }
}

function save() {
  const cleaned = name.value.trim()
  if (!cleaned) {
    error.value = 'Tell us what to call you.'
    return
  }
  void run(
    () => updateMe(cleaned),
    () => {
      saved.value = true
      emit('saved')
    },
  )
}

const leave = () => run(signOut, () => emit('signedOut'))
const wipe = () => run(deleteMe, () => emit('signedOut'))
</script>

<template>
  <div>
    <button class="link" type="button" data-test="back" @click="emit('back')">Back</button>
    <h2 class="group">My profile</h2>

    <form class="card" novalidate @submit.prevent="save">
      <label>
        Your name
        <input v-model="name" autocomplete="name" :maxlength="MAX_NAME_LENGTH" data-test="name" />
      </label>
      <label>
        Your number
        <input :value="props.person.phone" type="tel" disabled aria-describedby="phone-hint" data-test="phone" />
      </label>
      <p id="phone-hint" class="muted hint">Your number is how you sign in, so it can't be changed.</p>
      <div class="row">
        <button class="primary" type="submit" :disabled="busy" data-test="save">Save</button>
        <span v-if="saved" class="muted" role="status" data-test="saved">Saved.</span>
      </div>
    </form>

    <p v-if="error" class="error" role="alert" data-test="error">{{ error }}</p>

    <section class="card">
      <h3>Sign out</h3>
      <p>Only on this phone or computer. Your groups stay put, and a fresh code gets you back in.</p>
      <div class="row">
        <button class="link" type="button" :disabled="busy" data-test="sign-out" @click="leave">Sign out</button>
      </div>
    </section>

    <section class="danger">
      <button v-if="!confirming" class="link quiet" type="button" data-test="delete-me" @click="confirming = true">
        Delete my data
      </button>
      <div v-else>
        <p>
          This wipes every group you made, their helpers and every message, then forgets your name and number. It can't
          be undone.
        </p>
        <div class="row">
          <button class="danger-btn" type="button" :disabled="busy" data-test="confirm-delete-me" @click="wipe">
            Yes, delete it all
          </button>
          <button class="link" type="button" @click="confirming = false">Keep it</button>
        </div>
      </div>
    </section>
  </div>
</template>
