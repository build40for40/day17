import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import PhoneField from './PhoneField.vue'

const mountField = (modelValue = '') => {
  const wrapper = mount(PhoneField, {
    props: { label: 'Phone', modelValue, 'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }) },
  })
  return wrapper
}

describe('PhoneField', () => {
  it('shows the UK code and joins it to the number', async () => {
    const wrapper = mountField()

    expect(wrapper.get('[data-test="country"]').text()).toContain('+44')

    await wrapper.get('[data-test="phone"]').setValue('07700 900123')
    expect(wrapper.props('modelValue')).toBe('+447700900123')
  })

  it('is empty while the number is not valid', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('nope')

    expect(wrapper.props('modelValue')).toBe('')
  })

  it('turns away numbers from outside the UK', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('+33 6 12 34 56 78')

    expect(wrapper.props('modelValue')).toBe('')
  })

  it('accepts a pasted UK number with its code', async () => {
    const wrapper = mountField()

    await wrapper.get('[data-test="phone"]').setValue('+44 7700 900123')

    expect(wrapper.props('modelValue')).toBe('+447700900123')
  })

  it('shows an existing number without its code', () => {
    const wrapper = mountField('+447700900123')

    expect((wrapper.get('[data-test="phone"]').element as HTMLInputElement).value).toBe('7700900123')
  })
})
