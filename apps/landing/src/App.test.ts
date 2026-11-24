import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from './App.vue'

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('says the API is awake when it answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'The Worker says hi' })))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('[data-test="api"]').text()).toBe('The API is awake.')
  })

  it('says so when the API is not answering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('[data-test="api"]').text()).toBe('The API is having a lie-in.')
  })
})
