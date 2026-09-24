import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'

/** Props for a RefreshControl that only spins for the pull that started it. Driving `refreshing` from a query's
 *  isRefetching made every mounted tab share one spinner: a pull on Home (or any background refetch) set it on the
 *  hidden tabs too, and iOS leaves a control started off screen frozen at the top of the list. Leaving the screen
 *  ends it for the same reason. */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  useFocusEffect(useCallback(() => () => setRefreshing(false), []))
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    refetch().catch(() => {}).finally(() => setRefreshing(false))
  }, [refetch])
  return { refreshing, onRefresh }
}
