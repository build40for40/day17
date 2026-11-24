import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import ProfileView from './ProfileView.vue'

afterEach(() => vi.unstubAllGlobals())

const person = { id: 'p1', phone: '+447700900001', name: 'Sam' }

describe('ProfileView', () => {
  it('shows the number greyed out and the name ready to edit', () => {
    const wrapper = mount(ProfileView, { props: { person } })

    const phone = wrapper.get<HTMLInputElement>('[data-test="phone"]').element
    expect(phone.value).toBe('+447700900001')
    expect(phone.disabled).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[data-test="name"]').element.value).toBe('Sam')
  })

  it('saves a new name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ person: { ...person, name: 'Samira' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ProfileView, { props: { person } })

    await wrapper.get('[data-test="name"]').setValue(' Samira ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: 'Samira' })
    expect(wrapper.find('[data-test="saved"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('signs out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ProfileView, { props: { person } })

    await wrapper.get('[data-test="sign-out"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![0]).toContain('/sign-out')
    expect(wrapper.emitted('signedOut')).toHaveLength(1)
  })

  it('needs a confirm before deleting everything', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ProfileView, { props: { person } })

    await wrapper.get('[data-test="delete-me"]').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()

    await wrapper.get('[data-test="confirm-delete-me"]').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE')
    expect(wrapper.emitted('signedOut')).toHaveLength(1)
  })
})
