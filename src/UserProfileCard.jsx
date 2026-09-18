// UserProfileCard is a read-only popup showing another member's basic
// profile info — the same fields as the Edit Profile form, just not editable.
function UserProfileCard({ profile, email, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg w-80 p-6"
      >
        <div className="flex justify-end">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex flex-col items-center -mt-4 mb-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-300" />
          )}
          <h2 className="text-lg font-bold mt-3">{profile?.display_name || 'A member'}</h2>
        </div>

        {profile?.bio && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Bio</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {profile?.contact_info && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Contact</p>
            <p className="text-sm text-gray-700">{profile.contact_info}</p>
          </div>
        )}

        {!profile?.bio && !profile?.contact_info && (
          <p className="text-sm text-gray-400 text-center">This member hasn't added a bio or contact info yet.</p>
        )}
      </div>
    </div>
  )
}

export default UserProfileCard