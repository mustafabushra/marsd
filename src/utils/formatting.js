export const formatCurrency = (amount, currency = 'SAR') => {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: currency
  }).format(amount)
}

export const formatDate = (date, format = 'short') => {
  const d = new Date(date)
  if (format === 'short') {
    return d.toLocaleDateString('ar-SA')
  }
  if (format === 'long') {
    return d.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }
  return d.toISOString()
}

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
}

export const formatNumber = (num) => {
  return new Intl.NumberFormat('ar-SA').format(num)
}

export const formatPercentage = (num, decimals = 1) => {
  return `${(num).toFixed(decimals)}%`
}

export const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return phone
}

export const truncateText = (text, maxLength = 50) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export const capitalizeFirstLetter = (text) => {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}
