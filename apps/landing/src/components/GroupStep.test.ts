import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { MAX_HELPERS } from 'contract'

import GroupStep from './GroupStep.vue'

afterEach(() => vi.unstubAllGlobals())

async function fill(wrapper: ReturnType<typeof mount>, helpers: [string, string][]) {
  await wrapper.get('[data-test="parent-name"]').setValue('Sam')
  await wrapper.get('[data-test="group-name"]').setValue('The Martins')
  for (let i = 1; i < helpers.length; i++) await wrapper.get('[data-test="add"]').trigger('click')
  const rows = wrapper.findAll('[data-test="helper-row"]')
  for (const [i, [name, phone]] of helpers.entries()) {
    const inputs = rows[i]!.findAll('input')
    await inputs[0]!.setValue(name)
    await inputs[1]!.setValue(phone)
  }
}

describe('GroupStep', () => {
  it('adds and removes helper rows and stops at the maximum', async () => {
    const wrapper = mount(GroupStep)

    for (let i = 0; i < MAX_HELPERS + 3; i++) await wrapper.get('[data-test="add"]').trigger('click')
    expect(wrapper.findAll('[data-test="helper-row"]')).toHaveLength(MAX_HELPERS)
    expect(wrapper.get('[data-test="add"]').attributes('disabled')).toBeDefined()

    await wrapper.findAll('[data-test="remove"]')[0]!.trigger('click')
    expect(wrapper.findAll('[data-test="helper-row"]')).toHaveLength(MAX_HELPERS - 1)
  })

  it('flags a bad helper number before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(GroupStep)

    await fill(wrapper, [['Nan', 'nope']])
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[data-test="error"]').text()).toContain("doesn't look like a phone number")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags duplicate helper numbers', async () => {
    const wrapper = mount(GroupStep)

    await fill(wrapper, [
      ['Nan', '07700 900111'],
      ['Gran', '7700 900111'],
    ])
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[data-test="error"]').text()).toContain('twice')
  })

  it('posts normalised helpers and emits created', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ household: { id: 'h1' } }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(GroupStep)

    await fill(wrapper, [['Nan', '07700 900111']])
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      parentName: 'Sam',
      householdName: 'The Martins',
      helpers: [{ name: 'Nan', phone: '+447700900111' }],
    })
    expect(wrapper.emitted('created')).toEqual([['h1']])
  })

  it('emits expired when the session has gone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'unauthorized' }, { status: 401 })))
    const wrapper = mount(GroupStep)

    await fill(wrapper, [['Nan', '07700 900111']])
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('expired')).toHaveLength(1)
  })

  it('hides the name field and offers cancel when adding another group', async () => {
    const wrapper = mount(GroupStep, { props: { knownName: 'Sam' } })

    expect(wrapper.find('[data-test="parent-name"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('A new group')
    await wrapper.get('[data-test="cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
