import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import PhoneStep from './PhoneStep.vue'

afterEach(() => vi.unstubAllGlobals())

describe('PhoneStep', () => {
  it('rejects a bad number without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(PhoneStep)

    await wrapper.get('[data-test="phone"]').setValue('nope')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[data-test="error"]').text()).toContain("doesn't look right")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emits the normalised number once the code is sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })))
    const wrapper = mount(PhoneStep)

    await wrapper.get('[data-test="phone"]').setValue('07700 900123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('sent')).toEqual([['+447700900123']])
  })

  it('shows a friendly message for an API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'rate_limited' }, { status: 429 })))
    const wrapper = mount(PhoneStep)

    await wrapper.get('[data-test="phone"]').setValue('07700 900123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="error"]').text()).toContain('Wait a bit')
    expect(wrapper.emitted('sent')).toBeUndefined()
  })
})
