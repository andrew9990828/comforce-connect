// Accessible language picker, implemented by OpenAI Codex (GPT-6).
import { languages, setLanguage, t, useLanguage, type Language } from './language'

export default function LanguageSelect() {
  const language = useLanguage()
  return <label className="language-select">
    <span>{t('Language')}</span>
    <select value={language} onChange={event => setLanguage(event.target.value as Language)}>
      {Object.entries(languages).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
    </select>
  </label>
}
