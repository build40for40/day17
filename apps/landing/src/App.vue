<script setup lang="ts">
import { onMounted, ref } from 'vue'

type ApiState = 'checking' | 'up' | 'down'

const api = ref<ApiState>('checking')

const steps = [
  { title: 'Signal', text: 'Text one ask to your number. "Can anyone grab Léa at 5?"' },
  { title: 'Alert', text: 'Every helper you picked gets a text or a call, all at once.' },
  { title: 'Solved', text: 'Someone steps up, everyone hears about it, and the signal goes out.' },
]

onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/v1/greeting`)
    api.value = response.ok ? 'up' : 'down'
  } catch {
    api.value = 'down'
  }
})
</script>

<template>
  <main>
    <p class="day">40 for 40, Day 17</p>
    <h1>A bat signal for when the day falls apart.</h1>
    <p class="pitch">
      Hospital run, no nappies, stuck at work at pickup time. Send one ask and everyone you trust gets a text or a call at
      once. No app to install, and it works on grandma's phone too.
    </p>

    <ol>
      <li v-for="step in steps" :key="step.title">
        <h2>{{ step.title }}</h2>
        <p>{{ step.text }}</p>
      </li>
    </ol>

    <p class="live">
      We're building this live today.
      <a href="https://www.twitch.tv/40for40">Watch on Twitch</a>
    </p>

    <footer>
      <span v-if="api === 'up'" data-test="api">The API is awake.</span>
      <span v-else-if="api === 'down'" data-test="api">The API is having a lie-in.</span>
      <span v-else data-test="api">Poking the API…</span>
    </footer>
  </main>
</template>

<style scoped>
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.day {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b4530a;
}

h1 {
  margin: 0 0 1rem;
  font-size: clamp(2rem, 9vw, 3.25rem);
  line-height: 1.05;
  text-wrap: balance;
}

.pitch {
  margin: 0 0 2rem;
  font-size: 1.125rem;
}

ol {
  display: grid;
  gap: 0.75rem;
  margin: 0 0 2rem;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

li {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #fff4e0;
  counter-increment: step;
}

li h2 {
  margin: 0 0 0.25rem;
  font-size: 1.125rem;
}

li h2::before {
  content: counter(step) '. ';
}

li p {
  margin: 0;
}

.live a {
  font-weight: 600;
  color: #b4530a;
}

footer {
  margin-top: 2rem;
  font-size: 0.875rem;
  color: #6b6257;
}

@media (min-width: 40rem) {
  ol {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
