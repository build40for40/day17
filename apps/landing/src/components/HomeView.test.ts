import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { MeResponse } from 'contract'

import HomeView from './HomeView.vue'

afterEach(() => vi.unstubAllGlobals())

const me = (signalNumber: string | null): MeResponse => ({
  person: { id: 'p1', phone: '+447700900001', name: 'Sam' },
  household: {
    id: 'h1',
    name: 'The Martins',
    createdAt: '',
    helpers: [{ id: 'p2', name: 'Nan', phone: '+447700900111', optedOut: false }],
  },
  openSignal: null,
  recipients: [],
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

    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })
})
