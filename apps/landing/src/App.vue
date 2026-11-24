<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CreateHouseholdRequest, MeResponse, Signal } from 'contract'

import { ApiError, createHousehold, getMe } from './api'
import CodeStep from './components/CodeStep.vue'
import GroupStep from './components/GroupStep.vue'
import HomeView from './components/HomeView.vue'
import PhoneStep from './components/PhoneStep.vue'
import SignupStep from './components/SignupStep.vue'
import { messageFor } from './errors'
import familySquad from './assets/family-squad.jpg'
import lanternHug from './assets/lantern-hug.jpg'

// New parents fill in one page (signup), confirm their number (code), and land home.
// Returning parents sign in with just their number (phone, then code).
type Step = 'loading' | 'signup' | 'phone' | 'code' | 'group' | 'home'

const step = ref<Step>('loading')
const phone = ref('')
const me = ref<MeResponse | null>(null)
const loadError = ref('')
// The group typed on the signup page, held until the number is confirmed.
const pendingGroup = ref<CreateHouseholdRequest | null>(null)
const groupError = ref('')

async function load() {
  loadError.value = ''
  try {
    me.value = await getMe()
    step.value = me.value.household ? 'home' : 'group'
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'unauthorized') loadError.value = messageFor(e)
    step.value = 'signup'
  }
}

function codeSent(sentTo: string, group?: CreateHouseholdRequest) {
  phone.value = sentTo
  pendingGroup.value = group ?? null
  step.value = 'code'
}

async function verified() {
  const group = pendingGroup.value
  if (group) {
    try {
      await createHousehold(group)
      pendingGroup.value = null
    } catch (e) {
      // Already has a group: they signed up before, so just take them home.
      if (e instanceof ApiError && e.code === 'already_has_household') pendingGroup.value = null
      else groupError.value = messageFor(e)
    }
  }
  await load()
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
    <div v-if="step === 'signup' || step === 'phone' || step === 'code'" class="welcome">
      <div>
        <p class="day">40 for 40 · Day 17</p>
        <h1>Your family's <em>bat signal</em></h1>
        <p class="pitch">
          Stuck at work at school pickup. A hospital appointment that ran over. Send one ask and everyone you trust gets
          a text at once. No app to install, and it works on grandma's phone too.
        </p>

        <ol class="how">
          <li><div><b>Pick your heroes</b><span>Grandparents, friends, neighbours. Anyone you'd trust with the kids.</span></div></li>
          <li><div><b>Send one signal</b><span>Say what you need, when and where. Every hero gets it at once.</span></div></li>
          <li><div><b>Someone's on it</b><span>No group chat, no chasing. Mark it solved and everyone knows.</span></div></li>
        </ol>

        <p class="one-rule"><b>One emergency, one message.</b> "Can anyone grab Léa from school at 5?" is perfect.</p>

        <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>
        <SignupStep v-if="step === 'signup'" @sent="codeSent" @sign-in="step = 'phone'" />
        <PhoneStep v-else-if="step === 'phone'" @sent="codeSent" @sign-up="step = 'signup'" />
        <CodeStep v-else :phone="phone" @verified="verified" @back="step = pendingGroup ? 'signup' : 'phone'" />
      </div>

      <figure class="squad">
        <img :src="familySquad" alt="A grandmother, parents, a child and neighbours striking hero poses at a school gate with coloured smoke behind them" />
        <img class="lantern" :src="lanternHug" alt="" />
        <figcaption>Your squad, ready when you need them.</figcaption>
      </figure>
    </div>

    <div v-else class="flow">
      <p class="day">40 for 40 · Day 17</p>
      <p v-if="step === 'loading'" class="muted" data-test="loading">Warming up the lamp...</p>
      <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>

      <GroupStep
        v-if="step === 'group'"
        :initial="pendingGroup ?? undefined"
        :initial-error="groupError"
        @created="pendingGroup = null; groupError = ''; load()"
        @expired="signedOut"
      />
      <HomeView
        v-else-if="step === 'home' && me"
        :me="me"
        @signal="onSignal"
        @deleted="load"
        @expired="signedOut"
      />
    </div>

    <footer>
      We're building this live on
      <a href="https://www.twitch.tv/40for40">Twitch</a>. The app has no name yet, so it's just Day 17.
    </footer>
  </main>
</template>
