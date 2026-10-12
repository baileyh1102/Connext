// Shared @mention logic used by every composer (Chat, Threads, DMs) and
// every message renderer that needs to highlight mentions.

// Given the textarea's current text and cursor position, returns the partial
// name being typed if the user is actively in the middle of an "@mention"
// (an @ followed by non-space characters, right up to the cursor) — or null
// if they're not currently typing one.
export function detectMentionQuery(text, cursorPos) {
  const textBeforeCursor = text.slice(0, cursorPos)
  const match = textBeforeCursor.match(/@([^\s@]*)$/)
  return match ? match[1] : null
}

// Replaces the in-progress "@partial" text with the full "@DisplayName ",
// returning the new full text and where the cursor should land afterward.
export function insertMention(text, cursorPos, displayName) {
  const textBeforeCursor = text.slice(0, cursorPos)
  const textAfterCursor = text.slice(cursorPos)
  const withoutPartial = textBeforeCursor.replace(/@([^\s@]*)$/, '')
  const inserted = `${withoutPartial}@${displayName} `
  return {
    newText: inserted + textAfterCursor,
    newCursorPos: inserted.length,
  }
}

// Scans final message content for "@DisplayName" matches against a list of
// { user_id, display_name } members, returning the matched user_ids
// (longest names checked first, so "@Anna Banks" doesn't get mis-matched by
// a member simply named "Anna").
export function extractMentionedUserIds(content, members) {
  const sorted = [...members].sort((a, b) => (b.display_name?.length || 0) - (a.display_name?.length || 0))
  const matchedIds = new Set()
  let remaining = content

  sorted.forEach((m) => {
    if (!m.display_name) return
    const token = `@${m.display_name}`
    if (remaining.includes(token)) {
      matchedIds.add(m.user_id)
    }
  })

  return [...matchedIds]
}

// Renders message content as React nodes, wrapping any "@DisplayName" that
// matches a real member in a highlighted pill-style span.
export function mentionify(content, members) {
  if (!content) return [content]

  const sorted = [...members].filter((m) => m.display_name).sort((a, b) => b.display_name.length - a.display_name.length)
  if (sorted.length === 0) return [content]

  const pattern = new RegExp(`(@(?:${sorted.map((m) => m.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
  const parts = content.split(pattern)

  return parts.map((part, index) => {
    if (part.startsWith('@') && sorted.some((m) => `@${m.display_name}` === part)) {
      return (
        <span key={index} className="bg-blue-100 text-blue-700 font-medium px-1 rounded">
          {part}
        </span>
      )
    }
    return part
  })
}