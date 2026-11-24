<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MeResponse, Signal } from 'contract'

import { ApiError, getMe } from './api'
import CodeStep from './components/CodeStep.vue'
import GroupStep from './components/GroupStep.vue'
import HomeView from './components/HomeView.vue'
import PhoneStep from './components/PhoneStep.vue'
import { messageFor } from './errors'

type Step = 'loading' | 'phone' | 'code' | 'group' | 'home'

const step = ref<Step>('loading')
const phone = ref('')
const me = ref<MeResponse | null>(null)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    me.value = await getMe()
    step.value = me.value.household ? 'home' : 'group'
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'unauthorized') loadError.value = messageFor(e)
    step.value = 'phone'
  }
}

function signedOut() {
  me.value = null
  step.value = 'phone'
}

function onSignal(signal: Signal | null) {
  if (me.value) me.value = { ...me.value, openSignal: signal }
}

onMounted(load)
</script>

<template>
  <main>
    <p class="day">40 for 40, Day 17</p>
    <h1>A bat signal for when the day falls apart.</h1>

    <template v-if="step === 'phone' || step === 'code'">
      <p class="pitch">
        Hospital run, no nappies, stuck at work at pickup time. Send one ask and everyone you trust gets a text at once.
        No app to install, and it works on grandma's phone too.
      </p>
    </template>

    <p v-if="step === 'loading'" class="muted" data-test="loading">Warming up the lamp...</p>
    <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>

    <PhoneStep v-if="step === 'phone'" @sent="(p) => { phone = p; step = 'code' }" />
    <CodeStep v-else-if="step === 'code'" :phone="phone" @verified="load" @back="step = 'phone'" />
    <GroupStep v-else-if="step === 'group'" @created="load" @expired="signedOut" />
    <HomeView
      v-else-if="step === 'home' && me"
      :me="me"
      @signal="onSignal"
      @deleted="load"
      @expired="signedOut"
    />

    <footer>
      We're building this live on
      <a href="https://www.twitch.tv/40for40">Twitch</a>. The app has no name yet, so it's just Day 17.
    </footer>
  </main>
</template>
