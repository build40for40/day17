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
import scenePickup from './assets/scene-pickup.jpg'
import sceneBabysitting from './assets/scene-babysitting.jpg'
import sceneGp from './assets/scene-gp.jpg'
import scenePharmacy from './assets/scene-pharmacy.jpg'

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
  <main :class="{ wide: step === 'phone' || step === 'code' }">
    <div class="top">
      <p class="day">Lantern · 40 for 40, Day 17</p>
      <button v-if="me && !onProfile" class="link" type="button" data-test="profile" @click="showProfile(true)">
        My profile
      </button>
    </div>
    <div v-if="step === 'phone' || step === 'code'" class="welcome">
      <h1>Light a lantern when you need a hand.</h1>
      <p class="pitch">
        Stuck at work at pickup time. The babysitter cancelled. Light a lantern and everyone you trust gets a text at
        once. No app to install, and it works on grandma's phone too.
      </p>

      <ul class="scenes" aria-label="What people use it for">
        <li><img :src="scenePickup" alt="A paper lantern walking a girl out of the school gate" /><span>School pickup</span></li>
        <li><img :src="sceneBabysitting" alt="A paper lantern reading a bedtime story to a sleepy boy" /><span>Babysitting</span></li>
        <li><img :src="sceneGp" alt="A paper lantern walking a boy into the doctor's surgery" /><span>GP visit</span></li>
        <li><img :src="scenePharmacy" alt="A paper lantern collecting medicine at the pharmacy" /><span>Pharmacy</span></li>
      </ul>

      <section class="how" aria-labelledby="how-h">
        <h2 id="how-h">How it works</h2>
        <ol>
          <li><b>Make a group.</b> School pickup, babysitting, a trip to the GP. Add the people you'd call.</li>
          <li><b>Light a lantern.</b> Say what you need and when. We tick the right group, and everyone in it gets a text at once.</li>
          <li><b>Someone says they're on it.</b> You see who, and mark it sorted.</li>
        </ol>
        <p class="tip">One ask per lantern: "Can anyone grab Léa from school at 5?"</p>
      </section>

      <div class="welcome-form">
        <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>
        <PhoneStep v-if="step === 'phone'" @sent="(p) => { phone = p; step = 'code' }" />
        <CodeStep v-else :phone="phone" @verified="load" @back="step = 'phone'" />
      </div>
    </div>

    <template v-else>
      <h1>Light a lantern when you need a hand.</h1>
      <p v-if="step === 'loading'" class="muted" data-test="loading">Lighting the lantern...</p>
      <p v-if="loadError" class="error" role="alert" data-test="load-error">{{ loadError }}</p>
    </template>

    <ProfileView
      v-if="me && onProfile"
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
      <a href="https://www.twitch.tv/40for40">Twitch</a>. Lantern is Day 17 of 40 for 40.
    </footer>
  </main>
</template>
