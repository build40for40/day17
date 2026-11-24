<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { MeResponse } from 'contract'

import { ApiError, getMe } from './api'
import CodeStep from './components/CodeStep.vue'
import GroupStep from './components/GroupStep.vue'
import HomeView from './components/HomeView.vue'
import PhoneStep from './components/PhoneStep.vue'
import ProfileView from './components/ProfileView.vue'
import { messageFor } from './errors'
import { knownPeople } from './people'
import lanternHug from './assets/lantern-hug.jpg'

type Step = 'loading' | 'phone' | 'code' | 'group' | 'home'

const step = ref<Step>('loading')
const phone = ref('')
const me = ref<MeResponse | null>(null)
const loadError = ref('')
const adding = ref(false)
const startAt = ref<string>()

async function load() {
  loadError.value = ''
  try {
    me.value = await getMe()
    adding.value = false
    step.value = me.value.groups.length > 0 ? 'home' : 'group'
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'unauthorized') loadError.value = messageFor(e)
    step.value = 'phone'
  }
}

const PROFILE_HASH = '#profile'
const onProfile = ref(location.hash === PROFILE_HASH)
const syncProfile = () => {
  onProfile.value = location.hash === PROFILE_HASH
}

function showProfile(show: boolean) {
  onProfile.value = show
  location.hash = show ? PROFILE_HASH : ''
}

function signedOut() {
  me.value = null
  step.value = 'phone'
  showProfile(false)
}

const REFRESH_MS = 8000

async function refresh() {
  try {
    me.value = await getMe()
  } catch (e) {
    if (e instanceof ApiError && e.code === 'unauthorized') signedOut()
  }
}

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  window.addEventListener('hashchange', syncProfile)
  void load()
  timer = setInterval(() => {
    if (step.value === 'home' && !adding.value && me.value?.groups.some((group) => group.openSignal) && !document.hidden) void refresh()
  }, REFRESH_MS)
})
onUnmounted(() => {
  window.removeEventListener('hashchange', syncProfile)
  clearInterval(timer)
})
</script>

<template>
  <main>
    <div class="top">
      <p class="day">40 for 40, Day 17</p>
      <button v-if="me && !onProfile" class="link" type="button" data-test="profile" @click="showProfile(true)">
        My profile
      </button>
    </div>
    <h1>Light a lantern when you need a hand.</h1>

    <template v-if="step === 'phone' || step === 'code'">
      <div class="welcome-lantern"><img class="lantern" :src="lanternHug" alt="A paper lantern hugging a small child" /></div>
      <p class="pitch">
        Stuck at work at pickup time. The babysitter cancelled. Light a lantern and everyone you trust gets a text at
        once. No app to install, and it works on grandma's phone too.
      </p>
    </template>

    <p v-if="step === 'loading'" class="muted" data-test="loading">Lighting the lantern...</p>
    <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>

    <PhoneStep v-if="step === 'phone'" @sent="(p) => { phone = p; step = 'code' }" />
    <CodeStep v-else-if="step === 'code'" :phone="phone" @verified="load" @back="step = 'phone'" />
    <ProfileView
      v-else-if="me && onProfile"
      :person="me.person"
      @saved="refresh"
      @signed-out="signedOut"
      @expired="signedOut"
      @back="showProfile(false)"
    />
    <GroupStep v-else-if="step === 'group'" @created="load" @expired="signedOut" />
    <GroupStep
      v-else-if="step === 'home' && me && adding"
      :known-name="me.person.name"
      :known="knownPeople(me.groups)"
      @created="(id) => { startAt = id; void load() }"
      @expired="signedOut"
      @cancel="adding = false"
    />
    <HomeView
      v-else-if="step === 'home' && me"
      :me="me"
      :start-at="startAt"
      @changed="refresh"
      @deleted="load"
      @expired="signedOut"
      @add="adding = true"
    />

    <footer>
      We're building this live on
      <a href="https://www.twitch.tv/40for40">Twitch</a>. The app has no name yet, so it's just Day 17.
    </footer>
  </main>
</template>
