import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MAX_HELPERS, type Household } from 'contract'

import HelpersCard from './HelpersCard.vue'

afterEach(() => vi.unstubAllGlobals())

const household = (count = 1): Household => ({
  id: 'h1',
  name: 'The Martins',
  description: 'Family pickups',
  createdAt: '',
  helpers: Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Helper ${index}`,
    phone: `+4477009001${String(index).padStart(2, '0')}`,
    optedOut: false,
  })),
})

describe('HelpersCard', () => {
  it('adds a helper with the country code and says it changed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ household: household(2) }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HelpersCard, { props: { household: household() } })

    await wrapper.get('[data-test="add-helper"]').trigger('click')
    await wrapper.get('[data-test="helper-name"]').setValue(' Nan ')
    await wrapper.get('[data-test="phone"]').setValue('7700 900111')
    await wrapper.get('[data-test="add-helper-form"]').trigger('submit')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/households/helpers')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdId: 'h1', name: 'Nan', phone: '+447700900111' })
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.find('[data-test="add-helper-form"]').exists()).toBe(false)
  })

  it("won't send a helper without a name or a real number", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HelpersCard, { props: { household: household() } })

    await wrapper.get('[data-test="add-helper"]').trigger('click')
    await wrapper.get('[data-test="add-helper-form"]').trigger('submit')
    expect(wrapper.get('[data-test="helper-error"]').text()).toContain('need a name')

    await wrapper.get('[data-test="helper-name"]').setValue('Nan')
    await wrapper.get('[data-test="add-helper-form"]').trigger('submit')
    expect(wrapper.get('[data-test="helper-error"]').text()).toContain("Nan's number")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('needs a confirm before removing a helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ household: household(0) }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HelpersCard, { props: { household: household() } })

    await wrapper.get('[data-test="remove-helper"]').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()

    await wrapper.get('[data-test="confirm-remove-helper"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toBe('/day17/api/v1/households/helpers?personId=p0&id=h1')
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('shows the error and keeps the form when the add is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'duplicate_helper' }, { status: 400 })))
    const wrapper = mount(HelpersCard, { props: { household: household() } })

    await wrapper.get('[data-test="add-helper"]').trigger('click')
    await wrapper.get('[data-test="helper-name"]').setValue('Nan')
    await wrapper.get('[data-test="phone"]').setValue('7700 900199')
    await wrapper.get('[data-test="add-helper-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="helper-error"]').text()).toContain('twice')
    expect(wrapper.find('[data-test="add-helper-form"]').exists()).toBe(true)
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('adds someone from another group in one tap and only offers people not in this one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ household: household(2) }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const known = [
      { name: 'Helper 0', phone: '+447700900100' },
      { name: 'Sue', phone: '+447700900150' },
    ]
    const wrapper = mount(HelpersCard, { props: { household: household(), known } })

    await wrapper.get('[data-test="add-helper"]').trigger('click')
    const picks = wrapper.findAll('[data-test="known-person"]')
    expect(picks.map((pick) => pick.text())).toEqual(['+ Sue'])
    await picks[0]!.trigger('click')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ householdId: 'h1', name: 'Sue', phone: '+447700900150' })
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it("won't send a number that's already in the group", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(HelpersCard, { props: { household: household() } })

    await wrapper.get('[data-test="add-helper"]').trigger('click')
    await wrapper.get('[data-test="helper-name"]').setValue('Nan')
    await wrapper.get('[data-test="phone"]').setValue('07700 900100')
    await wrapper.get('[data-test="add-helper-form"]').trigger('submit')

    expect(wrapper.get('[data-test="helper-error"]').text()).toContain('already in this group, as Helper 0')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hides the add button when the group is full', () => {
    const wrapper = mount(HelpersCard, { props: { household: household(MAX_HELPERS) } })

    expect(wrapper.find('[data-test="add-helper"]').exists()).toBe(false)
  })
})
