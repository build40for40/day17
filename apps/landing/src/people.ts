import type { Group, HelperInput } from 'contract'

export function knownPeople(groups: Group[]): HelperInput[] {
  const byPhone = new Map<string, HelperInput>()
  for (const { household } of groups) {
    for (const helper of household.helpers) {
      if (!helper.optedOut && !byPhone.has(helper.phone)) byPhone.set(helper.phone, { name: helper.name, phone: helper.phone })
    }
  }
  return [...byPhone.values()]
}
