import { describe, expect, it } from 'vitest'

import { defaultGroupName, validateGroup } from './group'

const base = { parentName: ' Sam ', householdName: ' The Martins ', helpers: [{ name: ' Nan ', phone: '+447700900111' }] }

describe('validateGroup', () => {
  it('returns a trimmed request when everything is there', () => {
    expect(validateGroup(base)).toEqual({
      parentName: 'Sam',
      householdName: 'The Martins',
      helpers: [{ name: 'Nan', phone: '+447700900111' }],
    })
  })

  it('needs at least one hero', () => {
    expect(validateGroup({ ...base, helpers: [] })).toContain('at least one hero')
  })

  it('needs a name and a valid number for every hero', () => {
    expect(validateGroup({ ...base, helpers: [{ name: '', phone: '+447700900111' }] })).toContain('needs a name')
    expect(validateGroup({ ...base, helpers: [{ name: 'Nan', phone: '' }] })).toContain("doesn't look like a phone number")
  })

  it('catches the same number twice', () => {
    const helpers = [
      { name: 'Nan', phone: '+447700900111' },
      { name: 'Gran', phone: '+447700900111' },
    ]
    expect(validateGroup({ ...base, helpers })).toContain('twice')
  })
})

describe('defaultGroupName', () => {
  it("names the group after the parent, or nothing when there's no name yet", () => {
    expect(defaultGroupName(' Anastasia ')).toBe("Anastasia's crew")
    expect(defaultGroupName('  ')).toBe('')
  })
})
