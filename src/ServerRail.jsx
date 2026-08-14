// ServerRail is the far-left vertical strip showing server icons (Discord-style).
// Currently a visual placeholder with one server — real multi-server switching comes later.
function ServerRail() {
  return (
    <div className="w-16 bg-indigo-900 flex flex-col items-center py-3 gap-2">
      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold cursor-pointer hover:rounded-xl transition-all">
        C
      </div>
      <div className="w-8 h-px bg-indigo-700 my-1" />
      <button className="w-12 h-12 rounded-2xl bg-indigo-800 flex items-center justify-center text-indigo-300 text-2xl hover:bg-indigo-700 hover:text-white hover:rounded-xl transition-all">
        +
      </button>
    </div>
  )
}

export default ServerRail