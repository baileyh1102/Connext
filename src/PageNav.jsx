// PageNav is the tab switcher between a server's different sections
// (Chat, Home, Calendar, Ministry). Lives in the header, to the left
// of the profile avatar button. Purely presentational. App.jsx owns
// which page is active. Ministry only appears when showMinistry is true.
const PAGES = [
  { id: 'chat', label: 'Chat' },
  { id: 'home', label: 'Community' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'ministry', label: 'Ministry' },
]

function PageNav({ currentPage, setCurrentPage, showMinistry }) {
  return (
    <div className="flex gap-1">
      {PAGES.filter((p) => p.id !== 'ministry' || showMinistry).map((page) => (
        <button
          key={page.id}
          onClick={() => setCurrentPage(page.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            currentPage === page.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {page.label}
        </button>
      ))}
    </div>
  )
}

export default PageNav