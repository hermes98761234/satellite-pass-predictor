import { useState } from 'react'

type Props = { label: string; value: number | undefined; placeholder?: string; onCommit: (v: number | undefined) => void }

/** Frequency in MHz. Empty means "use the built-in default"; invalid text is ignored. */
export default function FreqField({ label, value, placeholder, onCommit }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const bad = draft !== null && draft.trim() !== '' && !(Number(draft) > 0 && Number(draft) < 100000)
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        placeholder={placeholder}
        value={draft ?? (value === undefined ? '' : String(value))}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = e.target.value.trim()
          if (v === '') onCommit(undefined)
          else if (Number(v) > 0 && Number(v) < 100000) onCommit(Number(v))
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
