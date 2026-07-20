/**
 * Custom Hook: useApi
 * Manages API calls with loading and error states
 * Supports both callback-based and promise-based patterns
 */

import { useState, useCallback } from 'react'
import { UseApiReturn } from '../types'

export function useApi<T>(
  apiCall: (...args: any[]) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
    autoCall?: boolean
    autoCallArgs?: any[]
  }
): UseApiReturn<T> {
  const [state, setState] = useState<{
    data: T | null
    loading: boolean
    error: string | null
  }>({
    data: null,
    loading: false,
    error: null,
  })

  const call = useCallback(
    async (...args: any[]) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await apiCall(...args)
        setState(prev => ({ ...prev, data: result, loading: false }))
        options?.onSuccess?.(result)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred'
        setState(prev => ({ ...prev, error: errorMessage, loading: false }))
        options?.onError?.(errorMessage)
        throw err
      }
    },
    [apiCall, options]
  )

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
    })
  }, [])

  // Auto-call on mount if enabled
  const [called, setCalled] = useState(false)
  if (
    options?.autoCall &&
    !called &&
    !state.loading &&
    state.data === null
  ) {
    setCalled(true)
    call(...(options.autoCallArgs || []))
  }

  return {
    ...state,
    call,
    reset,
  }
}

/**
 * Hook for managing form submission with API calls
 */
export function useApiForm<T>(
  apiCall: (formData: Record<string, any>) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
  }
) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    success: boolean
  }>({
    loading: false,
    error: null,
    success: false,
  })

  const submit = useCallback(
    async (formData: Record<string, any>) => {
      setState(prev => ({ ...prev, loading: true, error: null, success: false }))
      try {
        const result = await apiCall(formData)
        setState(prev => ({ ...prev, loading: false, success: true }))
        options?.onSuccess?.(result)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'فشلت العملية'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        options?.onError?.(errorMessage)
        throw err
      }
    },
    [apiCall, options]
  )

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      success: false,
    })
  }, [])

  return {
    ...state,
    submit,
    reset,
  }
}

/**
 * Hook for fetching data with pagination
 */
export function useApiPaginated<T>(
  apiCall: (page: number, limit: number, ...args: any[]) => Promise<{
    data: T[]
    pagination: any
  }>,
  initialPage = 1,
  initialLimit = 20
) {
  const [page, setPage] = useState(initialPage)
  const [limit, setLimit] = useState(initialLimit)
  const [data, setData] = useState<T[]>([])
  const [pagination, setPagination] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(
    async (...args: any[]) => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiCall(page, limit, ...args)
        setData(result.data)
        setPagination(result.pagination)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'فشل جلب البيانات'
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [apiCall, page, limit]
  )

  // Auto-fetch on mount or when page/limit changes
  const [initialized, setInitialized] = useState(false)
  if (!initialized) {
    setInitialized(true)
    fetch()
  }

  const goToPage = (newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, pagination?.pages || 1)))
  }

  const changeLimit = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  const refresh = useCallback(async () => {
    await fetch()
  }, [fetch])

  return {
    data,
    pagination,
    loading,
    error,
    page,
    limit,
    goToPage,
    changeLimit,
    refresh,
  }
}
