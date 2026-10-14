import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

// Tells App what to show for the current server:
//  - inMinistry: user is an ACTIVE member of at least one ministry here
//  - isLeader:   user leads at least one of them
//  - canManage:  user has the "Manage ministries" permission
export default function useMinistryAccess(userId, serverId) {
  const [inMinistry, setInMinistry] = useState(false)
  const [isLeader, setIsLeader] = useState(false)
  const [canManage, setCanManage] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId || !serverId) {
      setInMinistry(false)
      setIsLeader(false)
      setCanManage(false)
      return
    }
    const [{ data: mem }, { data: perm }] = await Promise.all([
      supabase
        .from('ministry_members')
        .select('is_leader, ministries!inner(server_id)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('ministries.server_id', serverId),
      supabase
        .from('server_members')
        .select('manage_ministries')
        .eq('server_id', serverId)
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    setInMinistry((mem || []).length > 0)
    setIsLeader((mem || []).some((r) => r.is_leader))
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

  return { inMinistry, isLeader, canManage, showMinistry: inMinistry || canManage, refresh }
}