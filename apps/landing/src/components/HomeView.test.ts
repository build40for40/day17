import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Group, MeResponse } from 'contract'

import HomeView from './HomeView.vue'

afterEach(() => vi.unstubAllGlobals())

const family: Group = {
  household: {
    id: 'h1',
    name: 'The Martins',
    description: 'Family pickups and emergencies',
    createdAt: '',
    helpers: [{ id: 'p2', name: 'Nan', phone: '+447700900111', optedOut: false }],
  },
  openSignal: null,
  recipients: [],
}
const football: Group = {
  household: { id: 'h2', name: 'Football', description: 'Sunday football parents', createdAt: '', helpers: [{ id: 'p3', name: 'Coach', phone: '+447700900112', optedOut: false }] },
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

  it('leaves the number out when there is none', () => {
    const wrapper = mount(HomeView, { props: { me: me(null) } })

    expect(wrapper.find('[data-test="number"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Your number to text')
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

  it('switches between groups to show their helpers', async () => {
    const wrapper = mount(HomeView, { props: { me: me(null, [family, football]) } })
    expect(wrapper.get('[data-test="group-name"]').text()).toBe('The Martins')

    await wrapper.findAll('[data-test="group-tab"]')[1]!.trigger('click')

    expect(wrapper.get('[data-test="group-name"]').text()).toBe('Football')
    expect(wrapper.get('[data-test="group-description"]').text()).toBe('Sunday football parents')
    expect(wrapper.text()).toContain('Coach')
    expect(wrapper.text()).not.toContain('Nan')
  })

  it('has one red button however many groups there are, and a panel per open signal', () => {
    const signal = { id: 's1', householdId: 'h2', text: 'Kit needed', source: 'web' as const, status: 'open' as const, openedAt: '', solvedAt: null, signedOffPersonId: null }
    const wrapper = mount(HomeView, { props: { me: me(null, [family, { ...football, openSignal: signal }]) } })

    expect(wrapper.findAll('[data-test="red-button"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="stage"]').map((stage) => stage.text())).toEqual(['Football: Signal is up'])
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
