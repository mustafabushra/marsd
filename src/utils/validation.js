export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validatePassword = (password) => {
  return password && password.length >= 8
}

export const validatePasswordMatch = (password, confirmPassword) => {
  return password === confirmPassword
}

export const validateCompanyName = (name) => {
  return name && name.trim().length >= 3
}

export const validatePhoneNumber = (phone) => {
  const phoneRegex = /^[0-9]{10}$/
  return phoneRegex.test(phone.replace(/\D/g, ''))
}

export const validateCommercialNumber = (number) => {
  return number && number.trim().length >= 8
}

export const validateForm = (formData, rules) => {
  const errors = {}

  Object.keys(rules).forEach(field => {
    const rule = rules[field]
    const value = formData[field]

    if (rule.required && !value) {
      errors[field] = `${rule.label || field} مطلوب`
    } else if (rule.validator && value && !rule.validator(value)) {
      errors[field] = rule.message || 'قيمة غير صحيحة'
    }
  })

  return errors
}
