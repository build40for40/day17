import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import SignupStep from './SignupStep.vue'

afterEach(() => vi.unstubAllGlobals())

type Wrapper = ReturnType<typeof mount>

async function fillParent(wrapper: Wrapper, name = 'Anastasia', phone = '07700 900400') {
  await wrapper.get('[data-test="parent-name"]').setValue(name)
  await wrapper.findAll('[data-test="phone"]')[0]!.setValue(phone)
}

async function addHero(wrapper: Wrapper, name: string, phone: string) {
  await wrapper.get('[data-test="add"]').trigger('click')
  const rows = wrapper.findAll('[data-test="helper-row"]')
  const row = rows[rows.length - 1]!
  const inputs = row.findAll('input')
  await inputs[0]!.setValue(name)
  await inputs[1]!.setValue(phone)
}

describe('SignupStep', () => {
  it('starts with no hero rows and adds one per tap', async () => {
    const wrapper = mount(SignupStep)

    expect(wrapper.findAll('[data-test="helper-row"]')).toHaveLength(0)
    expect(wrapper.get('[data-test="add"]').text()).toContain('Add your first hero')

    await wrapper.get('[data-test="add"]').trigger('click')
    expect(wrapper.findAll('[data-test="helper-row"]')).toHaveLength(1)
    expect(wrapper.get('[data-test="add"]').text()).toContain('Add another hero')

    await wrapper.get('[data-test="remove"]').trigger('click')
    expect(wrapper.findAll('[data-test="helper-row"]')).toHaveLength(0)
  })

  it('asks for a hero before texting a code', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignupStep)

    await fillParent(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[data-test="error"]').text()).toContain('at least one hero')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("won't put the parent on their own heroes list", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignupStep)

    await fillParent(wrapper)
    await addHero(wrapper, 'Me again', '07700 900400')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[data-test="error"]').text()).toContain('Your own number')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('texts the code and hands over the whole group, naming it after the parent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SignupStep)

    await fillParent(wrapper)
    await addHero(wrapper, 'Grandma Sue', '07700 900401')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ phone: '+447700900400' })
    expect(wrapper.emitted('sent')).toEqual([
      [
        '+447700900400',
        { parentName: 'Anastasia', householdName: "Anastasia's crew", helpers: [{ name: 'Grandma Sue', phone: '+447700900401' }] },
      ],
    ])
  })

  it('offers returning parents a way to sign in', async () => {
    const wrapper = mount(SignupStep)

    await wrapper.get('[data-test="sign-in"]').trigger('click')

    expect(wrapper.emitted('signIn')).toHaveLength(1)
  })
})
