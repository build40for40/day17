import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Household, MeResponse } from 'contract'

import App from './App.vue'

afterEach(() => vi.unstubAllGlobals())

const me = (household: Household | null): MeResponse => ({
  person: { id: 'p1', phone: '+447700900001', name: 'Sam' },
  groups: household ? [{ household, openSignal: null, recipients: [] }] : [],
  signalNumber: null,
})

describe('App', () => {
  it('starts at the phone step when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'unauthorized' }, { status: 401 })))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('[data-test="phone"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
  })

  it('goes to the group step for a signed in person without a group', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(me(null))))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('[data-test="parent-name"]').exists()).toBe(true)
  })

  it('goes straight home when there is a group', async () => {
    const household = { id: 'h1', name: 'The Martins', createdAt: '', helpers: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(me(household))))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('The Martins')
    expect(wrapper.find('[data-test="delete"]').exists()).toBe(true)
  })

  it('opens the profile page and comes back', async () => {
    const household = { id: 'h1', name: 'The Martins', createdAt: '', helpers: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(me(household))))

    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('[data-test="profile"]').trigger('click')

    expect(wrapper.get<HTMLInputElement>('[data-test="phone"]').element.value).toBe('+447700900001')
    expect(wrapper.find('[data-test="delete"]').exists()).toBe(false)

    await wrapper.get('[data-test="back"]').trigger('click')
    expect(wrapper.find('[data-test="delete"]').exists()).toBe(true)
  })

  it('moves from phone to code after the code is sent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('[data-test="phone"]').setValue('07700 900001')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-test="code"]').exists()).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ phone: '+447700900001' })
  })
})
