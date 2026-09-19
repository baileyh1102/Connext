// Finds URLs in a block of text and renders them as real clickable links,
// leaving everything else as plain text. Used anywhere message content is
// displayed (ChatView, ThreadPanel, DMChatView) so links actually work
// instead of showing as inert text.
const URL_REGEX = /(https?:\/\/[^\s]+)/g

export function linkify(text) {
  if (!text) return text

  const parts = text.split(URL_REGEX)

  return parts.map((part, index) => {
    if (part.match(URL_REGEX)) {
      const trailingPunctuation = /[.,!?;:)\]]+$/
      const match = part.match(trailingPunctuation)
      const cleanUrl = match ? part.slice(0, -match[0].length) : part
      const trailing = match ? match[0] : ''

      return (
        <span key={index}>
          <a href={cleanUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-700" onClick={(e) => e.stopPropagation()}>
            {cleanUrl}
          </a>
          {trailing}
        </span>
      )
    }
    return part
  })
}