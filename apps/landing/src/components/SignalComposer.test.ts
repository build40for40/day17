import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MAX_SIGNAL_LENGTH, type Group } from 'contract'

import SignalComposer from './SignalComposer.vue'

const group = (id: string, name: string): Group => ({
  household: { id, name, description: `${name} things`, createdAt: '', helpers: [] },
  openSignal: null,
  recipients: [],
})
const family = group('h1', 'The Martins')
const football = group('h2', 'Football')

const matches = (h1: number, h2: number) =>
  Response.json({ matches: [{ householdId: 'h1', score: h1 }, { householdId: 'h2', score: h2 }] })

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.get('[data-test="red-button"]').trigger('click')
  await wrapper.get('[data-test="text"]').setValue(text)
  await vi.advanceTimersByTimeAsync(500)
  await flushPromises()
}

const picked = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[data-test="pick-group"]').map((chip) => chip.attributes('aria-pressed'))

describe('SignalComposer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the lantern asleep while nothing is open', () => {
    const wrapper = mount(SignalComposer, { props: { groups: [family] } })

    expect(wrapper.get('[data-test="lantern"]').attributes('src')).toContain('lantern-sleep')
  })

  it('opens the text field from the red button and counts characters', async () => {
    const wrapper = mount(SignalComposer, { props: { groups: [family] } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue('hello')

    expect(wrapper.get('[data-test="counter"]').text()).toContain(`${MAX_SIGNAL_LENGTH - 5} left`)
  })

  it('sends straight to the only group without asking the classifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signals: [] }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalComposer, { props: { groups: [family] } })

    await type(wrapper, 'Grab Léa at 5')
    expect(wrapper.find('[data-test="pick-group"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdIds: ['h1'], text: 'Grab Léa at 5' })
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('picks the groups that match at 60% or more as the parent types', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(matches(0.59, 0.6)).mockResolvedValueOnce(Response.json({ signals: [] }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalComposer, { props: { groups: [family, football] } })

    await type(wrapper, "Who's playing at 10?")

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/signals/match')
    expect(picked(wrapper)).toEqual(['false', 'true'])
    expect(wrapper.findAll('[data-test="pick-group"]')[1]!.text()).toContain('60%')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ householdIds: ['h2'], text: "Who's playing at 10?" })
  })

  it('picks nothing and blocks sending when no group reaches 60%', async () => {
    const fetchMock = vi.fn().mockResolvedValue(matches(0.3, 0.5))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalComposer, { props: { groups: [family, football] } })

    await type(wrapper, 'Anyone seen my keys?')

    expect(picked(wrapper)).toEqual(['false', 'false'])
    expect(wrapper.get('[data-test="send"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="hint"]').text()).toContain('No group looks like a match')

    await wrapper.get('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="error"]').text()).toContain('Pick at least one group')
  })

  it("keeps the parent's own picks over the classifier's", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matches(0.9, 0.1))
      .mockResolvedValueOnce(matches(0.95, 0.05))
      .mockResolvedValueOnce(Response.json({ signals: [] }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalComposer, { props: { groups: [family, football] } })

    await type(wrapper, 'Stuck at A&E')
    const chips = wrapper.findAll('[data-test="pick-group"]')
    await chips[0]!.trigger('click')
    await chips[1]!.trigger('click')
    expect(picked(wrapper)).toEqual(['false', 'true'])

    await wrapper.get('[data-test="text"]').setValue('Stuck at A&E, can someone get Léa?')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(picked(wrapper)).toEqual(['false', 'true'])

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body).householdIds).toEqual(['h2'])
  })

  it('leaves the picking to the parent when the classifier is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'classifier_unavailable' }, { status: 503 })))
    const wrapper = mount(SignalComposer, { props: { groups: [family, football] } })

    await type(wrapper, 'Grab Léa at 5')

    expect(picked(wrapper)).toEqual(['false', 'false'])
    expect(wrapper.get('[data-test="hint"]').text()).toContain("couldn't guess")
  })

  it('shows an empty ask as an error without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignalComposer, { props: { groups: [family] } })

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a rate limit error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'too_many_signals' }, { status: 429 })))
    const wrapper = mount(SignalComposer, { props: { groups: [family] } })

    await type(wrapper, 'help')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="error"]').text()).toContain('24 hours')
  })
})
