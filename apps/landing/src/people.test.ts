import { describe, expect, it } from 'vitest'
import type { Group, Helper } from 'contract'

import { knownPeople } from './people'

const group = (id: string, helpers: Helper[]): Group => ({
  household: { id, name: id, description: '', createdAt: '', helpers },
  openSignal: null,
  recipients: [],
})

describe('knownPeople', () => {
  it('lists each number once across groups and leaves out anyone who said STOP', () => {
    const nan = { id: 'p1', name: 'Nan', phone: '+447700900111', optedOut: false }
    const sue = { id: 'p2', name: 'Sue', phone: '+447700900112', optedOut: false }
    const gone = { id: 'p3', name: 'Gone', phone: '+447700900113', optedOut: true }

    const people = knownPeople([group('a', [nan, gone]), group('b', [{ ...nan, name: 'Nanny' }, sue])])

    expect(people).toEqual([
      { name: 'Nan', phone: '+447700900111' },
      { name: 'Sue', phone: '+447700900112' },
    ])
  })
})
