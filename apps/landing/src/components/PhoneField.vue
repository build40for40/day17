<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { COUNTRIES, composePhone, countryOf, type CountryIso } from 'contract'

const props = defineProps<{ label: string; autocomplete?: boolean }>()
const phone = defineModel<string>({ default: '' })

const known = countryOf(phone.value)
const iso = ref<CountryIso>(known?.iso ?? COUNTRIES[0].iso)
const national = ref(known ? phone.value.slice(known.dial.length + 1) : '')

const country = computed(() => COUNTRIES.find((c) => c.iso === iso.value)!)

watch([iso, national], () => {
  const composed = composePhone(country.value.dial, national.value)
  const pasted = composed && countryOf(composed)
  if (pasted && pasted.iso !== iso.value) {
    iso.value = pasted.iso
    national.value = composed.slice(pasted.dial.length + 1)
  }
  phone.value = composed ?? ''
})
</script>

<template>
  <div class="phone-field">
    <select
      v-if="COUNTRIES.length > 1"
      v-model="iso"
      :aria-label="`${props.label}: country code`"
      :autocomplete="props.autocomplete ? 'tel-country-code' : 'off'"
      data-test="country"
    >
      <option v-for="c in COUNTRIES" :key="c.iso" :value="c.iso" :title="c.name">{{ c.flag }} +{{ c.dial }}</option>
    </select>
    <span v-else class="dial" :title="country.name" data-test="country">{{ country.flag }} +{{ country.dial }}</span>
    <input
      v-model="national"
      type="tel"
      inputmode="tel"
      :aria-label="props.label"
      :autocomplete="props.autocomplete ? 'tel-national' : 'off'"
      :placeholder="country.example"
      data-test="phone"
    />
  </div>
</template>
