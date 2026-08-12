import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

function Profile({ session, onClose }) {
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (data) {
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setContactInfo(data.contact_info || '')
        setAvatarUrl(data.avatar_url || '')
      }
    }
    loadProfile()
  }, [session])

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    let finalAvatarUrl = avatarUrl

    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop()
      const filePath = `${session.user.id}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true })

      if (uploadError) {
        console.log('Full upload error:', uploadError)
        setMessage(`Error uploading image: ${uploadError.message}`)
        setLoading(false)
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      finalAvatarUrl = publicUrlData.publicUrl
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: session.user.id,
        display_name: displayName,
        bio: bio,
        contact_info: contactInfo,
        avatar_url: finalAvatarUrl,
      }, { onConflict: 'user_id' })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Profile saved!')
      setAvatarUrl(finalAvatarUrl)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-md w-96 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Edit Profile</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSave}>
        <div className="flex flex-col items-center mb-4">
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="relative group"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                  No photo
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                Change
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
            placeholder="How you'll appear in chat"
          />

          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
            rows="3"
            placeholder="Tell people about yourself"
          />

          <label className="block text-sm font-medium mb-1">Contact Info</label>
          <input
            type="text"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
            placeholder="Email, phone, etc."
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-600/90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
          {message && <p className="mt-3 text-sm text-center">{message}</p>}
        </form>
      </div>
    </div>
  )
}

export default Profile