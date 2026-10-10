import { useState } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}

/** A number input that keeps the raw text while focused and only commits values inside [min, max]. */
export default function NumberField({ label, value, min, max, step, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const bad = draft !== null && !(draft.trim() !== '' && Number(draft) >= min && Number(draft) <= max)
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        min={min}
        max={max}
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        value={draft ?? String(+value.toFixed(5))}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== '' && v >= min && v <= max) onChange(v)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
