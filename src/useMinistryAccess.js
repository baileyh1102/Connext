import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

// Tells App whether to show the Ministry tab for the current server:
// true if the user is active in or invited to a ministry here,
// or has the "Manage ministries" permission.
export default function useMinistryAccess(userId, serverId) {
  const [inMinistry, setInMinistry] = useState(false)
  const [canManage, setCanManage] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId || !serverId) {
      setInMinistry(false)
      setCanManage(false)
      return
    }
    const [{ data: mem }, { data: perm }] = await Promise.all([
      supabase
        .from('ministry_members')
        .select('ministry_id, ministries!inner(server_id)')
        .eq('user_id', userId)
        .eq('ministries.server_id', serverId)
        .limit(1),
      supabase
        .from('server_members')
        .select('manage_ministries')
        .eq('server_id', serverId)
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    setInMinistry((mem || []).length > 0)
    setCanManage(!!perm?.manage_ministries)
  }, [userId, serverId])

  useEffect(() => {
    refresh()
    if (!userId) return
    const channel = supabase
      .channel(`ministry-access-${userId}-${serverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ministry_members', filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refresh, userId, serverId])

  return { inMinistry, canManage, showMinistry: inMinistry || canManage, refresh }
}