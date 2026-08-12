function Dashboard({ profile, session, onEditProfile, onLogout, onClose }) {
  return (
    <div className="absolute top-14 right-4 bg-white rounded-lg shadow-lg w-64 p-4 z-40 border">
      <div className="flex items-center gap-3 mb-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-300" />
        )}
        <div>
          <p className="font-semibold">{profile?.display_name || 'No name set'}</p>
          <p className="text-xs text-gray-500">{session.user.email}</p>
        </div>
      </div>

      {profile?.bio && <p className="text-sm text-gray-600 mb-4">{profile.bio}</p>}

      <button
        onClick={onEditProfile}
        className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100 mb-1"
      >
        Edit Profile
      </button>
      <button
        onClick={onLogout}
        className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100 text-red-600"
      >
        Log Out
      </button>
    </div>
  )
}

export default Dashboard