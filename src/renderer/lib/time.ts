/** Compact relative timestamp for the session list ("3m ago" / "3 分钟前"). */
export function formatRelativeTime(ts: number, lang: 'zh' | 'en'): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000))
  if (minutes < 1) return lang === 'zh' ? '刚刚' : 'just now'
  if (minutes < 60) return lang === 'zh' ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return lang === 'zh' ? `${days} 天前` : `${days}d ago`
  return new Date(ts).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric'
  })
}
