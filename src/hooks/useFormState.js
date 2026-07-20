import { useState, useCallback } from 'react'

/**
 * Custom hook for managing form state
 * Handles form data, validation, and submission
 */
export function useFormState(initialValues, onSubmit, validate) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = useCallback((e) => {
    const { name, type, checked, value } = e.target
    setValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))

    if (touched[name] && validate) {
      const fieldError = validate({ ...values, [name]: type === 'checkbox' ? checked : value }, name)
      setErrors(prev => ({
        ...prev,
        [name]: fieldError
      }))
    }
  }, [values, touched, validate])

  const handleBlur = useCallback((e) => {
    const { name } = e.target
    setTouched(prev => ({
      ...prev,
      [name]: true
    }))

    if (validate) {
      const fieldError = validate(values, name)
      setErrors(prev => ({
        ...prev,
        [name]: fieldError
      }))
    }
  }, [values, validate])

  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault()

    setIsSubmitting(true)

    if (validate) {
      const formErrors = validate(values)
      setErrors(formErrors)

      if (Object.keys(formErrors).length > 0) {
        setIsSubmitting(false)
        return
      }
    }

    try {
      await onSubmit(values)
    } finally {
      setIsSubmitting(false)
    }
  }, [values, onSubmit, validate])

  const resetForm = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  const setFieldValue = useCallback((name, value) => {
    setValues(prev => ({
      ...prev,
      [name]: value
    }))
  }, [])

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    setFieldValue,
    setValues
  }
}
