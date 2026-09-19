import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ReactionPicker from './ReactionPicker'
import homeBg from './assets/mascot_stock_image.png'
import communityWallHeader from './assets/community_wall_header.png'
import FloatingBubbles from './FloatingBubbles'

// Small three-dot menu, top-right of a post, for Edit/Delete — only rendered for the post's own author
function PostMenu({ onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="text-gray-400 hover:text-gray-600 px-1"
        aria-label="Post options"
      >
        ⋮
      </button>
      {showMenu && (
        <div className="absolute right-0 top-6 bg-white border rounded shadow-lg z-10 w-32">
          {onEdit && (
            <button
              onClick={() => { onEdit(); setShowMenu(false) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => { onDelete(); setShowMenu(false) }}
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// HomePage is the server's main feed: an Instagram-style scrolling feed of
// everyone's Prayer Request / Praise Report posts, with reactions, comments,
// and optional anonymous posting. Laid out like CalendarPage — a tall
// content rectangle over the mascot background, with a "+ Post" button to
// reveal the composer instead of showing it up front.
function HomePage({ selectedServer, session, isAdmin, canEditPosts, canDeletePosts }) {
  const [posts, setPosts] = useState([])
  const [postsProfilesMap, setPostsProfilesMap] = useState({})
  const [postContent, setPostContent] = useState('')
  const [postType, setPostType] = useState('prayer') // 'prayer' | 'praise'
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [showComposer, setShowComposer] = useState(false)

  const [editingPostId, setEditingPostId] = useState(null)
  const [editPostValue, setEditPostValue] = useState('')

  const [postReactionsMap, setPostReactionsMap] = useState({}) // { postId: [{ emoji, user_id }, ...] }

  const [commentsMap, setCommentsMap] = useState({}) // { postId: [comment, ...] }
  const [commentInputs, setCommentInputs] = useState({}) // { postId: 'text being typed' }
  const [expandedComments, setExpandedComments] = useState({}) // { postId: true/false }

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

  // ---- POST REACTIONS: fetch + realtime (scoped to the posts currently loaded) ----
  useEffect(() => {
    if (posts.length === 0) {
      setPostReactionsMap({})
      return
    }

    const fetchReactions = async () => {
      const postIds = posts.map((p) => p.id)
      const { data } = await supabase
        .from('post_reactions')
        .select('post_id, emoji, user_id')
        .in('post_id', postIds)

      const map = {}
      data?.forEach((r) => {
        if (!map[r.post_id]) map[r.post_id] = []
        map[r.post_id].push(r)
      })
      setPostReactionsMap(map)
    }
    fetchReactions()

    const channel = supabase
      .channel(`post-reactions-${selectedServer?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, () => {
        fetchReactions()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [posts])

  // ---- COMMENTS: fetch + realtime (scoped to the posts currently loaded) ----
  useEffect(() => {
    if (posts.length === 0) {
      setCommentsMap({})
      return
    }

    const fetchComments = async () => {
      const postIds = posts.map((p) => p.id)
      const { data } = await supabase
        .from('post_comments')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })

      const map = {}
      data?.forEach((c) => {
        if (!map[c.post_id]) map[c.post_id] = []
        map[c.post_id].push(c)
      })
      setCommentsMap(map)
    }
    fetchComments()

    const channel = supabase
      .channel(`post-comments-${selectedServer?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => {
        fetchComments()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [posts])

  // Loads display names/avatars for post authors
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
      setPostsProfilesMap((current) => ({ ...current, ...map }))
    }
    fetchProfiles()
  }, [posts])

  // Loads display names/avatars for comment authors too (posts and comments can involve different people)
  useEffect(() => {
    const fetchCommentProfiles = async () => {
      const commentUserIds = [...new Set(Object.values(commentsMap).flat().map((c) => c.user_id))]
      if (commentUserIds.length === 0) return

      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', commentUserIds)

      const map = {}
      data?.forEach((p) => { map[p.user_id] = p })
      setPostsProfilesMap((current) => ({ ...current, ...map }))
    }
    fetchCommentProfiles()
  }, [commentsMap])

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
    setShowComposer(false)
  }

  const handleDeletePost = async (id) => {
    if (window.confirm('Delete this post?')) {
      await supabase.from('posts').delete().eq('id', id)
    }
  }

  const startEditingPost = (post) => {
    setEditingPostId(post.id)
    setEditPostValue(post.content)
  }

  const submitEditPost = async (postId) => {
    if (editPostValue.trim()) {
      await supabase.from('posts').update({ content: editPostValue.trim() }).eq('id', postId)
    }
    setEditingPostId(null)
  }

  // Toggles a reaction on a post — same tap-to-toggle pattern as message reactions
  const handleTogglePostReaction = async (postId, emoji) => {
    const existing = postReactionsMap[postId]?.find(
      (r) => r.emoji === emoji && r.user_id === session.user.id
    )

    if (existing) {
      await supabase
        .from('post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', session.user.id)
        .eq('emoji', emoji)
    } else {
      await supabase.from('post_reactions').insert({
        post_id: postId,
        user_id: session.user.id,
        emoji: emoji,
      })
    }
  }

  const getGroupedReactions = (postId) => {
    const reactions = postReactionsMap[postId] || []
    const grouped = {}
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reactedByMe: false }
      grouped[r.emoji].count += 1
      if (r.user_id === session.user.id) grouped[r.emoji].reactedByMe = true
    })
    return grouped
  }

  const handleAddComment = async (postId) => {
    const text = commentInputs[postId]
    if (!text?.trim()) return
    await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: session.user.id,
      content: text.trim(),
    })
    setCommentInputs((current) => ({ ...current, [postId]: '' }))
  }

  const handleDeleteComment = async (commentId) => {
    if (window.confirm('Delete this comment?')) {
      await supabase.from('post_comments').delete().eq('id', commentId)
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
    <div
      className="relative flex-1 overflow-y-auto bg-gray-100"
      style={{ backgroundImage: `url(${homeBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <FloatingBubbles
        selectedServer={selectedServer}
        currentUserId={session.user.id}
        currentUserName={postsProfilesMap[session.user.id]?.display_name}
      />     
      <div className="relative z-10 max-w-xl mx-auto w-full flex flex-col flex-1 pointer-events-none">
        <div className="flex flex-col items-center gap-3 mb-4 pointer-events-auto">
          <img src={communityWallHeader} alt="Community Wall" className="h-12 drp-shadow-md" />
          <button
            onClick={() => setShowComposer(!showComposer)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-full shadow"
          >
            {showComposer ? 'Cancel' : '+ Post'}
          </button>
        </div>

        {showComposer && (
          <form onSubmit={handleSubmitPost} className="bg-white p-4 rounded-lg shadow-sm mb-4">
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
              autoFocus
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmitPost(e)
                }
              }}
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
              <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                Post
              </button>
            </div>
          </form>
        )}

        {/* ---- FEED ---- */}
        <div className="border border-gray-200 bg-gray-50 px-4 py-4 space-y-4 flex-1 rounded-lg">
          {posts.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">No posts yet — be the first to share.</p>
          )}
          {posts.map((post) => {
            const authorProfile = postsProfilesMap[post.user_id]
            const isOwnPost = post.user_id === session.user.id
            const displayName = post.is_anonymous ? 'Someone' : (authorProfile?.display_name || 'A member')
            const actionLabel = post.type === 'prayer' ? 'Prayer Request' : 'Praise'
            const isEditing = editingPostId === post.id
            const groupedReactions = getGroupedReactions(post.id)
            const comments = commentsMap[post.id] || []
            const areCommentsOpen = expandedComments[post.id]

            return (
              <div key={post.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  {/* Big emoji badge, top-left */}
                  <div className="text-3xl shrink-0">
                    {post.type === 'prayer' ? '🙏' : '🙌'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="text-sm">
                        <span className="font-semibold">{displayName}</span>
                        <span className="text-gray-500"> posted a {actionLabel}</span>
                      </p>
                      {(isOwnPost || canEditPosts || canDeletePosts) && !isEditing && (
                      <PostMenu
                        onEdit={(isOwnPost || canEditPosts) ? () => startEditingPost(post) : null}
                        onDelete={(isOwnPost || canDeletePosts) ? () => handleDeletePost(post.id) : null}
                      />
                    )}
                    </div>
                    <p className="text-xs text-gray-400">{formatTime(post.created_at)}</p>

                    {isEditing ? (
                      <div className="mt-2">
                        <textarea
                          autoFocus
                          value={editPostValue}
                          onChange={(e) => setEditPostValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              submitEditPost(post.id)
                            }
                            if (e.key === 'Escape') setEditingPostId(null)
                          }}
                          rows={3}
                          className="w-full border rounded p-2 text-sm resize-none"
                        />
                        <div className="text-xs text-gray-400 mt-1">Enter to save, Shift+Enter for a new line, Esc to cancel</div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                    )}

                    {/* ---- REACTIONS ---- */}
                    <div className="flex flex-wrap items-center gap-1 mt-3">
                      {Object.entries(groupedReactions).map(([emoji, { count, reactedByMe }]) => (
                        <button
                          key={emoji}
                          onClick={() => handleTogglePostReaction(post.id, emoji)}
                          className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            reactedByMe
                              ? 'bg-blue-100 border-blue-400 text-blue-700'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{count}</span>
                        </button>
                      ))}
                      <ReactionPicker onSelect={(emoji) => handleTogglePostReaction(post.id, emoji)} />
                      <button
                        onClick={() => setExpandedComments((current) => ({ ...current, [post.id]: !current[post.id] }))}
                        className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                      >
                        {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comment'}
                      </button>
                    </div>

                    {/* ---- COMMENTS ---- */}
                    {areCommentsOpen && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {comments.map((c) => {
                          const commentProfile = postsProfilesMap[c.user_id]
                          const isOwnComment = c.user_id === session.user.id
                          return (
                            <div key={c.id} className="flex justify-between items-start text-sm">
                              <p>
                                <span className="font-semibold">{commentProfile?.display_name || 'A member'}</span>{' '}
                                <span className="text-gray-700">{c.content}</span>
                              </p>
                              {isOwnComment && (
                                <button
                                  onClick={() => handleDeleteComment(c.id)}
                                  className="text-xs text-red-400 hover:text-red-600 ml-2 shrink-0"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )
                        })}
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleAddComment(post.id) }}
                          className="flex gap-2 pt-1"
                        >
                          <input
                            type="text"
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs((current) => ({ ...current, [post.id]: e.target.value }))}
                            placeholder="Write a comment..."
                            className="flex-1 border rounded p-1.5 text-sm"
                          />
                          <button type="submit" className="text-sm text-blue-600 hover:underline">
                            Post
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
    </div>
      </div>
    </div>
  )
}

export default HomePage
