import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { MeResponse } from 'contract'

import App from './App.vue'

afterEach(() => vi.unstubAllGlobals())

const me = (household: MeResponse['household']): MeResponse => ({
  person: { id: 'p1', phone: '+447700900001', name: 'Sam' },
  household,
  openSignal: null,
  signalNumber: null,
})

describe('App', () => {
  it('starts at the one-page sign-up when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'unauthorized' }, { status: 401 })))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('[data-test="signup"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
  })

  it('creates the group typed on the sign-up page once the code checks out', async () => {
    const household = { id: 'h1', name: "Anastasia's crew", createdAt: '', helpers: [] }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 })) // GET /me
      .mockResolvedValueOnce(Response.json({ ok: true })) // POST /verify/start
      .mockResolvedValueOnce(Response.json({ ok: true })) // POST /verify/check
      .mockResolvedValueOnce(Response.json({ household }, { status: 201 })) // POST /households
      .mockResolvedValueOnce(Response.json(me(household))) // GET /me
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('[data-test="parent-name"]').setValue('Anastasia')
    await wrapper.findAll('[data-test="phone"]')[0]!.setValue('07700 900400')
    await wrapper.get('[data-test="add"]').trigger('click')
    const hero = wrapper.get('[data-test="helper-row"]').findAll('input')
    await hero[0]!.setValue('Grandma Sue')
    await hero[1]!.setValue('07700 900401')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await wrapper.get('[data-test="code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const [path, init] = fetchMock.mock.calls[3]!
    expect(path).toContain('/households')
    expect(JSON.parse(init.body)).toEqual({
      parentName: 'Anastasia',
      householdName: "Anastasia's crew",
      helpers: [{ name: 'Grandma Sue', phone: '+447700900401' }],
    })
    expect(wrapper.text()).toContain("Anastasia's crew")
  })

  it('keeps what was typed and asks again if the group fails to save', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ error: 'invalid_phone' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json(me(null)))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('[data-test="parent-name"]').setValue('Anastasia')
    await wrapper.findAll('[data-test="phone"]')[0]!.setValue('07700 900400')
    await wrapper.get('[data-test="add"]').trigger('click')
    const hero = wrapper.get('[data-test="helper-row"]').findAll('input')
    await hero[0]!.setValue('Grandma Sue')
    await hero[1]!.setValue('07700 900401')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-test="code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect((wrapper.get('[data-test="parent-name"]').element as HTMLInputElement).value).toBe('Anastasia')
    expect(wrapper.get('[data-test="error"]').text()).toContain("doesn't look right")
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
    expect(wrapper.find('[data-test="number-soon"]').exists()).toBe(true)
  })

  it('lets a returning parent sign in with just their number', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('[data-test="sign-in"]').trigger('click')
    await wrapper.get('[data-test="phone"]').setValue('07700 900001')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-test="code"]').exists()).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ phone: '+447700900001' })
  })
})
