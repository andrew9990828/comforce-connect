// OpenAI Codex (GPT-6) localized feedback for native form constraints.
export function firstFieldError(form: HTMLFormElement): string | undefined {
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:invalid, select:invalid, textarea:invalid')
  if (!field) return
  field.focus()
  if (field.validity.valueMissing) return 'Complete the selected field.'
  if (field instanceof HTMLInputElement && field.type === 'email') return 'Enter an email address such as resident@example.com.'
  if (field.autocomplete === 'one-time-code') return 'Enter the six-digit sign-in code.'
  if (field.validity.rangeOverflow && field instanceof HTMLInputElement && field.type === 'datetime-local') return 'Choose the time the follow-up happened.'
  return 'Check the value in the selected field.'
}
