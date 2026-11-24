import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MAX_SIGNAL_LENGTH, type Signal } from 'contract'

import SignalPanel from './SignalPanel.vue'

afterEach(() => vi.unstubAllGlobals())

const signal: Signal = {
  id: 's1',
  householdId: 'h1',
  text: 'Grab Léa at 5',
  source: 'web',
  status: 'open',
  openedAt: '',
  solvedAt: null,
}

describe('SignalPanel', () => {
  it('opens the text field from the red button and counts characters', async () => {
    const wrapper = mount(SignalPanel, { props: { openSignal: null } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('hello')

    expect(wrapper.get('[data-test="counter"]').text()).toContain(`${MAX_SIGNAL_LENGTH - 5} left`)
  })

  it('sends the signal and emits it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { openSignal: null } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('Grab Léa at 5')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/signals')
    expect(wrapper.emitted('changed')).toEqual([[signal]])
  })

  it('shows an empty ask as an error without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { openSignal: null } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the open signal and closes it with Solved', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal: { ...signal, status: 'solved' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { openSignal: signal } })

    expect(wrapper.get('[data-test="open-text"]').text()).toBe('Grab Léa at 5')
    await wrapper.get('[data-test="solve"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/signals/solve')
    expect(wrapper.emitted('changed')).toEqual([[null]])
  })

  it('lets the parent send an update while a signal is open', async () => {
    const wrapper = mount(SignalPanel, { props: { openSignal: signal } })

    await wrapper.get('[data-test="update"]').trigger('click')

    expect(wrapper.text()).toContain('What is the update?')
  })

  it('maps a rate limit error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'too_many_signals' }, { status: 429 })))
    const wrapper = mount(SignalPanel, { props: { openSignal: null } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('help')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="error"]').text()).toContain('24 hours')
  })
})
