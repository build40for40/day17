import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Group, MeResponse } from 'contract'

import HomeView from './HomeView.vue'

afterEach(() => vi.unstubAllGlobals())

const family: Group = {
  household: {
    id: 'h1',
    name: 'The Martins',
    createdAt: '',
    helpers: [{ id: 'p2', name: 'Nan', phone: '+447700900111', optedOut: false }],
  },
  openSignal: null,
  recipients: [],
}
const football: Group = {
  household: { id: 'h2', name: 'Football', createdAt: '', helpers: [{ id: 'p3', name: 'Coach', phone: '+447700900112', optedOut: false }] },
  openSignal: null,
  recipients: [],
}

const me = (signalNumber: string | null, groups: Group[] = [family]): MeResponse => ({
  person: { id: 'p1', phone: '+447700900001', name: 'Sam' },
  groups,
  signalNumber,
})

describe('HomeView', () => {
  it('shows the number when there is one', () => {
    const wrapper = mount(HomeView, { props: { me: me('+447700900500') } })

    expect(wrapper.get('[data-test="number"]').text()).toBe('+447700900500')
    expect(wrapper.text()).toContain('Nan')
  })

  it('says the number is on its way when there is none', () => {
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    expect(wrapper.find('[data-test="number"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="number-soon"]').text()).toContain('on its way')
  })

  it('needs a confirm before deleting, then emits deleted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    await wrapper.get('[data-test="delete"]').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()

    await wrapper.get('[data-test="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/households/mine?id=h1')
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })

  it('shows no switcher for one group, just the way to add another', () => {
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    expect(wrapper.findAll('[data-test="group-tab"]')).toHaveLength(0)
    expect(wrapper.get('[data-test="add-group"]').text()).toContain('New group')
  })

  it('switches between groups and sends the signal to the one on screen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signal: {} }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HomeView, { props: { me: me(null, [family, football]) } })
    expect(wrapper.get('[data-test="group-name"]').text()).toBe('The Martins')

    await wrapper.findAll('[data-test="group-tab"]')[1]!.trigger('click')
    expect(wrapper.get('[data-test="group-name"]').text()).toBe('Football')
    expect(wrapper.text()).toContain('Coach')
    expect(wrapper.text()).not.toContain('Nan')

    await wrapper.get('[data-test="red-button"]').trigger('click')
    await wrapper.get('[data-test="text"]').setValue("Who's playing at 10?")
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdId: 'h2', text: "Who's playing at 10?" })
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('jumps to a group that was just added', async () => {
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    await wrapper.setProps({ me: me(null, [family, football]) })

    expect(wrapper.get('[data-test="group-name"]').text()).toBe('Football')
  })

  it('opens on the group it is told to start at', () => {
    const wrapper = mount(HomeView, { props: { me: me(null, [family, football]), startAt: 'h2' } })

    expect(wrapper.get('[data-test="group-name"]').text()).toBe('Football')
  })

  it('asks to add a group', async () => {
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    await wrapper.get('[data-test="add-group"]').trigger('click')

    expect(wrapper.emitted('add')).toHaveLength(1)
  })
})
