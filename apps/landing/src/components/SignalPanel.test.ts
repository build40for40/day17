import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MAX_SIGNAL_LENGTH, type Signal, type SignalRecipient } from 'contract'

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
  signedOffPersonId: null,
}

describe('SignalPanel', () => {
  it('opens the text field from the red button and counts characters', async () => {
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: null, recipients: [] } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('hello')

    expect(wrapper.get('[data-test="counter"]').text()).toContain(`${MAX_SIGNAL_LENGTH - 5} left`)
  })

  it('sends the signal and emits it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: null, recipients: [] } })

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
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: null, recipients: [] } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the open signal and closes it with Solved', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal: { ...signal, status: 'solved' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients: [] } })

    expect(wrapper.get('[data-test="open-text"]').text()).toBe('Grab Léa at 5')
    await wrapper.get('[data-test="solve"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/signals/solve')
    expect(wrapper.emitted('changed')).toEqual([[null]])
  })

  it('lets the parent send an update while a signal is open', async () => {
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients: [] } })

    await wrapper.get('[data-test="update"]').trigger('click')

    expect(wrapper.text()).toContain('What is the update?')
  })

  it('shows where each helper is and confirms one who offered', async () => {
    const recipients: SignalRecipient[] = [
      { personId: 'p1', name: 'Grandma', state: 'accepted', signedOff: false },
      { personId: 'p2', name: 'Theo', state: 'pending', signedOff: false },
      { personId: 'p3', name: 'Camille', state: 'not_read', signedOff: false },
    ]
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal: { ...signal, signedOffPersonId: 'p1' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients } })

    expect(wrapper.findAll('[data-test="recipient"]').map((row) => row.find('.state').text())).toEqual(['Can help', 'Checking', 'No reply yet'])
    expect(wrapper.findAll('[data-test="confirm"]')).toHaveLength(1)

    await wrapper.get('[data-test="confirm"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/signals/sign-off')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdId: 'h1', personId: 'p1' })
    expect(wrapper.emitted('changed')).toEqual([[{ ...signal, signedOffPersonId: 'p1' }]])
  })

  it('names the helper who is on it and offers a switch to the backup', () => {
    const recipients: SignalRecipient[] = [
      { personId: 'p1', name: 'Grandma', state: 'accepted', signedOff: true },
      { personId: 'p2', name: 'Theo', state: 'accepted', signedOff: false },
    ]
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: { ...signal, signedOffPersonId: 'p1' }, recipients } })

    expect(wrapper.get('[data-test="stage"]').text()).toBe('Grandma is on it')
    expect(wrapper.findAll('[data-test="confirm"]').map((button) => button.text())).toEqual(['Switch to them'])
  })

  it('maps a rate limit error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'too_many_signals' }, { status: 429 })))
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: null, recipients: [] } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('help')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="error"]').text()).toContain('24 hours')
  })

  it('shows the lantern asleep, alarmed, then running once someone is on it', async () => {
    const recipient: SignalRecipient = { personId: 'p2', name: 'Nan', state: 'accepted', signedOff: false }
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: null, recipients: [] } })
    const lantern = () => wrapper.get('[data-test="lantern"]').attributes('src')

    expect(lantern()).toContain('lantern-sleep')

    await wrapper.setProps({ openSignal: signal, recipients: [recipient] })
    expect(lantern()).toContain('lantern-alert')

    await wrapper.setProps({ recipients: [{ ...recipient, signedOff: true }] })
    expect(lantern()).toContain('lantern-running')
  })
})
