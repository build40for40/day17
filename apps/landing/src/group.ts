import type { CreateHouseholdRequest, HelperInput } from 'contract'

export type GroupDraft = {
  parentName: string
  householdName: string
  helpers: { name: string; phone: string }[]
}

/** Checks a group before it goes to the API. Returns the request to send, or a message to show. */
export function validateGroup(draft: GroupDraft): CreateHouseholdRequest | string {
  const parentName = draft.parentName.trim()
  const householdName = draft.householdName.trim()
  if (!parentName || !householdName) return 'Tell us your name and a name for the group.'
  if (draft.helpers.length === 0) return 'Add at least one hero. A bat signal needs someone to see it.'
  const helpers: HelperInput[] = []
  for (const helper of draft.helpers) {
    const name = helper.name.trim()
    if (!name) return 'Every hero needs a name.'
    if (!helper.phone) return `${name}'s number doesn't look like a phone number. Check the country code and the digits.`
    helpers.push({ name, phone: helper.phone })
  }
  if (new Set(helpers.map((h) => h.phone)).size !== helpers.length) return 'The same number is on your list twice.'
  return { parentName, householdName, helpers }
}

/** What the group is called when the parent leaves the name blank. */
export const defaultGroupName = (parentName: string) => (parentName.trim() ? `${parentName.trim()}'s crew` : '')
