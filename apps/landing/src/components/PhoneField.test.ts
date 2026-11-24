import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import PhoneField from './PhoneField.vue'

afterEach(() => vi.unstubAllGlobals())

const mountField = (modelValue = '') => {
  const wrapper = mount(PhoneField, {
    props: { label: 'Phone', modelValue, 'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }) },
  })
  return wrapper
}

describe('PhoneField', () => {
  it('joins the picked country code and the number', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('07700 900123')
    expect(wrapper.props('modelValue')).toBe('+447700900123')

    await wrapper.get('[data-test="country"]').setValue('FR')
    await wrapper.get('[data-test="phone"]').setValue('06 12 34 56 78')
    expect(wrapper.props('modelValue')).toBe('+33612345678')
  })

  it('is empty while the number is not valid', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('nope')

    expect(wrapper.props('modelValue')).toBe('')
  })

  it('starts on France for a French browser', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })

    const wrapper = mountField()

    expect((wrapper.get('[data-test="country"]').element as HTMLSelectElement).value).toBe('FR')
  })

  it('switches country when a full number with another code is pasted', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('+33 6 12 34 56 78')

    expect((wrapper.get('[data-test="country"]').element as HTMLSelectElement).value).toBe('FR')
    expect((wrapper.get('[data-test="phone"]').element as HTMLInputElement).value).toBe('612345678')
    expect(wrapper.props('modelValue')).toBe('+33612345678')
  })

  it('shows the country of an existing number', () => {
    const wrapper = mountField('+33612345678')

    expect((wrapper.get('[data-test="country"]').element as HTMLSelectElement).value).toBe('FR')
    expect((wrapper.get('[data-test="phone"]').element as HTMLInputElement).value).toBe('612345678')
  })
})
