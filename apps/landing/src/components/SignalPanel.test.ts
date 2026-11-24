import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Signal, SignalRecipient } from 'contract'

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
  it('shows the open signal and closes it with Solved', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal: { ...signal, status: 'solved' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients: [] } })

    expect(wrapper.get('[data-test="open-text"]').text()).toBe('Grab Léa at 5')
    await wrapper.get('[data-test="solve"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/lantern/api/v1/signals/solve')
    expect(wrapper.emitted('changed')).toEqual([[null]])
  })

  it('sends an update to its own group while a signal is open', async () => {
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients: [] } })

    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signals: [signal] }))
    vi.stubGlobal('fetch', fetchMock)

    await wrapper.get('[data-test="update"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('Make it 5:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdIds: ['h1'], text: 'Make it 5:30' })
    expect(wrapper.emitted('changed')).toEqual([[signal]])
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

    expect(fetchMock.mock.calls[0]![0]).toBe('/lantern/api/v1/signals/sign-off')
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

  it('shows the lantern alarmed, then running once someone is on it', async () => {
    const recipient: SignalRecipient = { personId: 'p2', name: 'Nan', state: 'accepted', signedOff: false }
    const wrapper = mount(SignalPanel, { props: { householdId: 'h1', openSignal: signal, recipients: [recipient] } })
    const lantern = () => wrapper.get('[data-test="lantern"]').attributes('src')

    expect(lantern()).toContain('lantern-alert')

    await wrapper.setProps({ recipients: [{ ...recipient, signedOff: true }] })
    expect(lantern()).toContain('lantern-running')
  })
})
