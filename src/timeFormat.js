export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

export function formatTimeAgo(dateStr) {
  const duration = formatDuration(Date.now() - new Date(dateStr).getTime())
  return duration === 'just now' ? duration : `${duration} ago`
}
