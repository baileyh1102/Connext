import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// HomePage is the server's main feed: an announcements banner at the top
// (admin-only to post), then a composer for Prayer/Praise posts, then an
// Instagram-style scrolling feed of everyone's posts.
function HomePage({ selectedServer, session, isAdmin }) {
  const [announcements, setAnnouncements] = useState([])
  const [newAnnouncement, setNewAnnouncement] = useState('')
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)

  const [posts, setPosts] = useState([])
  const [postsProfilesMap, setPostsProfilesMap] = useState({})
  const [postContent, setPostContent] = useState('')
  const [postType, setPostType] = useState('prayer') // 'prayer' | 'praise'
  const [isAnonymous, setIsAnonymous] = useState(false)

  // ---- ANNOUNCEMENTS: fetch + realtime ----
  useEffect(() => {
    if (!selectedServer) return

    const fetchAnnouncements = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('created_at', { ascending: false })
      setAnnouncements(data || [])
    }
    fetchAnnouncements()

    const channel = supabase
      .channel(`announcements-${selectedServer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements', filter: `server_id=eq.${selectedServer.id}` }, () => {
        fetchAnnouncements()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedServer])

  // ---- POSTS: fetch + realtime ----
  useEffect(() => {
    if (!selectedServer) return

    const fetchPosts = async () => {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('created_at', { ascending: false }) // newest first, Instagram-style
      setPosts(data || [])
    }
    fetchPosts()

    const channel = supabase
      .channel(`posts-${selectedServer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `server_id=eq.${selectedServer.id}` }, () => {
        fetchPosts()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedServer])

  // Loads display names/avatars for post authors (only needed for non-anonymous posts,
  // but simplest to just fetch for everyone who has posted)
  useEffect(() => {
    const fetchProfiles = async () => {
      const userIds = [...new Set(posts.map((p) => p.user_id))]
      if (userIds.length === 0) return

      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds)

      const map = {}
      data?.forEach((p) => { map[p.user_id] = p })
      setPostsProfilesMap(map)
    }
    fetchProfiles()
  }, [posts])

  const handleAddAnnouncement = async (e) => {
    e.preventDefault()
    if (!newAnnouncement.trim()) return
    await supabase.from('announcements').insert({
      server_id: selectedServer.id,
      user_id: session.user.id,
      content: newAnnouncement.trim(),
    })
    setNewAnnouncement('')
    setShowAnnouncementForm(false)
  }

  const handleDeleteAnnouncement = async (id) => {
    if (window.confirm('Delete this announcement?')) {
      await supabase.from('announcements').delete().eq('id', id)
    }
  }

  const handleSubmitPost = async (e) => {
    e.preventDefault()
    if (!postContent.trim()) return
    const { error } = await supabase.from('posts').insert({
      server_id: selectedServer.id,
      user_id: session.user.id,
      type: postType,
      content: postContent.trim(),
      is_anonymous: isAnonymous,
    })
    if (error) console.log('Post insert error:', error)
    setPostContent('')
    setIsAnonymous(false)
  }

  const handleDeletePost = async (id) => {
    if (window.confirm('Delete this post?')) {
      await supabase.from('posts').delete().eq('id', id)
    }
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100">
      {/* ---- ANNOUNCEMENTS BANNER ---- */}
      <div className="bg-yellow-50 border-b border-yellow-200 p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-yellow-800 text-sm">📢 Announcements</h2>
          {isAdmin && (
            <button
              onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
              className="text-xs text-yellow-700 hover:underline"
            >
              {showAnnouncementForm ? 'Cancel' : '+ New Announcement'}
            </button>
          )}
        </div>

        {showAnnouncementForm && (
          <form onSubmit={handleAddAnnouncement} className="mb-3 flex gap-2">
            <input
              type="text"
              autoFocus
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value)}
              placeholder="Write an announcement..."
              className="flex-1 border border-yellow-300 rounded p-2 text-sm"
            />
            <button type="submit" className="bg-yellow-600 text-white px-3 py-2 rounded text-sm hover:bg-yellow-700">
              Post
            </button>
          </form>
        )}

        {announcements.length === 0 ? (
          <p className="text-sm text-yellow-700/60">No announcements yet.</p>
        ) : (
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="flex justify-between items-start bg-white/60 rounded p-2">
                <div>
                  <p className="text-sm text-gray-800">{a.content}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatTime(a.created_at)}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="text-xs text-red-400 hover:text-red-600 ml-2"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- POST COMPOSER ---- */}
      <div className="bg-white border-b p-4">
        <form onSubmit={handleSubmitPost}>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setPostType('prayer')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                postType === 'prayer' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              🙏 Prayer Request
            </button>
            <button
              type="button"
              onClick={() => setPostType('praise')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                postType === 'praise' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              🙌 Praise
            </button>
          </div>
          <textarea
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder={postType === 'prayer' ? "What's on your heart?" : 'What are you thankful for?'}
            rows={3}
            className="w-full border rounded p-2 text-sm resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              Post anonymously
            </label>
            <button type="submit" className="bg-gray-800 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-900">
              Post
            </button>
          </div>
        </form>
      </div>

      {/* ---- FEED ---- */}
      <div className="max-w-xl mx-auto py-4 space-y-4">
        {posts.length === 0 && (
          <p className="text-center text-gray-400 text-sm">No posts yet — be the first to share.</p>
        )}
        {posts.map((post) => {
          const authorProfile = postsProfilesMap[post.user_id]
          const isOwnPost = post.user_id === session.user.id
          const displayName = post.is_anonymous ? 'Someone' : (authorProfile?.display_name || 'A member')
          const actionLabel = post.type === 'prayer' ? 'Prayer Request' : 'Praise'

          return (
            <div key={post.id} className="bg-white rounded-lg shadow-sm mx-4 overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                {/* Big emoji badge, top-left */}
                <div className="text-3xl flex-shrink-0">
                  {post.type === 'prayer' ? '🙏' : '🙌'}
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{displayName}</span>
                    <span className="text-gray-500"> posted a {actionLabel}</span>
                  </p>
                  <p className="text-xs text-gray-400">{formatTime(post.created_at)}</p>
                  <p className="mt-2 whitespace-pre-wrap">{post.content}</p>

                  {isOwnPost && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="text-xs text-red-400 hover:text-red-600 mt-2"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HomePage