import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import CodeStep from './CodeStep.vue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const mountStep = () => mount(CodeStep, { props: { phone: '+447700900123' } })

describe('CodeStep', () => {
  it('rejects a code that is not 6 digits', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountStep()

    await wrapper.get('[data-test="code"]').setValue('123')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emits verified on a good code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })))
    const wrapper = mountStep()

    await wrapper.get('[data-test="code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('verified')).toHaveLength(1)
  })

  it('maps a wrong code error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'invalid_code' }, { status: 400 })))
    const wrapper = mountStep()

    await wrapper.get('[data-test="code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="error"]').text()).toContain("doesn't match")
  })

  it('holds resend behind a visible cooldown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountStep()
    const resend = wrapper.get('[data-test="resend"]')

    expect(resend.attributes('disabled')).toBeDefined()
    expect(resend.text()).toContain('30s')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(resend.attributes('disabled')).toBeUndefined()

    await resend.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resend.attributes('disabled')).toBeDefined()
  })
})
