import { supabase } from './supabaseClient'

// Computes exactly who can see a given channel, replicating the same
// permission fallback chain used by the database's RLS policies:
// channel-specific override -> channel default -> category-specific
// override -> category default -> visible by default. The server creator
// can always see everything, regardless of any of these settings.
export async function computeChannelViewers(channel, server) {
  const { data: memberRows } = await supabase
    .from('server_members')
    .select('user_id')
    .eq('server_id', server.id)

  const memberIds = (memberRows || []).map((m) => m.user_id)
  const allUserIds = [...new Set([...memberIds, server.created_by])]

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', allUserIds)

  const { data: channelPermRows } = await supabase
    .from('channel_permissions')
    .select('*')
    .eq('channel_id', channel.id)

  let categoryPermRows = []
  if (channel.category_id) {
    const { data } = await supabase
      .from('category_permissions')
      .select('*')
      .eq('category_id', channel.category_id)
    categoryPermRows = data || []
  }

  const channelDefault = channelPermRows?.find((r) => r.member_user_id === null)
  const categoryDefault = categoryPermRows.find((r) => r.member_user_id === null)

  const canView = (userId) => {
    if (userId === server.created_by) return true

    const channelOverride = channelPermRows?.find((r) => r.member_user_id === userId)
    if (channelOverride) return channelOverride.can_view

    if (channelDefault) return channelDefault.can_view

    const categoryOverride = categoryPermRows.find((r) => r.member_user_id === userId)
    if (categoryOverride) return categoryOverride.can_view

    if (categoryDefault) return categoryDefault.can_view

    return true
  }

  return allUserIds
    .filter((id) => canView(id))
    .map((id) => profileRows?.find((p) => p.user_id === id))
    .filter(Boolean)
}