import { useState } from 'react'
import { toDateInputValue } from './inspectionFormat'

export function SaveStatus({ status }) {
  if (!status) return null
  if (status === 'saving') return <p className="mt-1 text-xs text-gray-400">Saving…</p>
  if (status === 'saved') return <p className="mt-1 text-xs text-green-600">Saved</p>
  return <p className="mt-1 text-xs text-red-600">{status}</p>
}

export function EditableText({ rowId, field, value, onSave }) {
  const [text, setText] = useState(value ?? '')
  const [status, setStatus] = useState(null)

  return (
    <div>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === (value ?? '')) return
          onSave(rowId, field, text || null, setStatus)
        }}
        className="w-full min-w-64 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <SaveStatus status={status} />
    </div>
  )
}

export function EditableDate({ rowId, field, value, onSave }) {
  const initial = toDateInputValue(value)
  const [date, setDate] = useState(initial)
  const [status, setStatus] = useState(null)

  return (
    <div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onBlur={() => {
          if (date === initial) return
          onSave(rowId, field, date || null, setStatus)
        }}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <SaveStatus status={status} />
    </div>
  )
}

export function EditableCheckbox({ rowId, field, value, onSave }) {
  const [checked, setChecked] = useState(!!value)
  const [status, setStatus] = useState(null)

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const next = e.target.checked
          setChecked(next)
          onSave(rowId, field, next, setStatus)
        }}
        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
      />
      <SaveStatus status={status} />
    </div>
  )
}

export function EditableStatus({ rowId, value, onSave }) {
  const [status, setStatus] = useState(value)
  const [saveStatus, setSaveStatus] = useState(null)

  return (
    <div>
      <select
        value={status}
        onChange={(e) => {
          const next = e.target.value
          setStatus(next)
          onSave(rowId, 'status', next, setSaveStatus)
        }}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm capitalize focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      >
        <option value="active">Active</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
      </select>
      <SaveStatus status={saveStatus} />
    </div>
  )
}
