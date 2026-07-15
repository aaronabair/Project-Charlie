import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const SKIP = '__skip__'

const TARGET_FIELDS = [
  { value: 'invoice', label: 'Invoice', type: 'text' },
  { value: 'inspection_type', label: 'Inspection Type', type: 'text' },
  { value: 'file_request', label: 'File Request', type: 'text' },
  { value: 'payment', label: 'Payment', type: 'number' },
  { value: 'assigned_to', label: 'Primary Inspector (name → ID not yet supported)', type: 'assigned' },
  { value: 'inspection_date', label: 'Inspection Date', type: 'date' },
  { value: 'status', label: 'Inspection Result', type: 'status' },
  { value: 'report_finished_at', label: 'Report Finished', type: 'timestamp' },
  { value: 'notes', label: 'Inspector Notes', type: 'text' },
  { value: 'distributor', label: 'Distributor', type: 'text' },
  { value: 'purchase_date', label: 'Purchase Date', type: 'date' },
  { value: 'customer', label: 'Customer', type: 'text' },
  { value: 'phone', label: 'Phone', type: 'text' },
  { value: 'address', label: 'Address', type: 'text' },
  { value: 'city', label: 'City', type: 'text' },
  { value: 'measure', label: 'Measure', type: 'text' },
  { value: 'equipment', label: 'Equipment', type: 'text' },
  { value: 'quantity', label: 'Quantity', type: 'number' },
  { value: 'total_incentive', label: 'Total Incentive', type: 'number' },
  { value: 'additional_information', label: 'Additional Information', type: 'text' },
  { value: 'uploaded_at', label: 'Uploaded', type: 'timestamp' },
  { value: 'external_id', label: 'External ID', type: 'text' },
  { value: 'due_date', label: 'Due Date', type: 'date' },
]

const TARGET_FIELD_META = Object.fromEntries(TARGET_FIELDS.map((f) => [f.value, f]))

const STATUS_ALIASES = {
  pass: 'pass',
  passed: 'pass',
  p: 'pass',
  fail: 'fail',
  failed: 'fail',
  f: 'fail',
  active: 'active',
  open: 'active',
  pending: 'active',
  'in progress': 'active',
}

function normalizeStatus(raw) {
  const key = String(raw ?? '').trim().toLowerCase()
  if (STATUS_ALIASES[key]) return { value: STATUS_ALIASES[key], flagged: false }
  return { value: 'active', flagged: true }
}

function normalizeValue(raw, type) {
  if (raw === '' || raw == null) return null

  switch (type) {
    case 'number': {
      const n = Number(String(raw).replace(/[^0-9.-]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    case 'timestamp': {
      const d = raw instanceof Date ? raw : new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    default:
      return String(raw).trim() || null
  }
}

function buildMappedRow(sourceRow, finalMap) {
  const target = {}
  let flaggedStatus = false
  let statusOriginal = null

  for (const header of Object.keys(finalMap)) {
    const targetField = finalMap[header]
    if (targetField === 'assigned_to') continue // known limitation: name → profile id lookup not implemented

    const raw = sourceRow[header]

    if (targetField === 'status') {
      const result = normalizeStatus(raw)
      target.status = result.value
      if (result.flagged) {
        flaggedStatus = true
        statusOriginal = raw
      }
      continue
    }

    const meta = TARGET_FIELD_META[targetField]
    target[targetField] = normalizeValue(raw, meta?.type ?? 'text')
  }

  return { target, sourceRow, flaggedStatus, statusOriginal }
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => resolve({ headers: results.meta.fields ?? [], rows: results.data }),
      error: reject,
    })
  })
}

async function parseXlsx(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const headers = (rows2d[0] || []).map((h) => String(h).trim())
  const rows = rows2d.slice(1).map((r) => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? ''
    })
    return obj
  })

  return { headers, rows }
}

async function parseFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsx(file)
  throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.')
}

export default function DataUpload() {
  const { session, profile } = useAuth()

  const [step, setStep] = useState('upload') // upload | mapping | preview | summary
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)

  const [parsedHeaders, setParsedHeaders] = useState([])
  const [parsedRows, setParsedRows] = useState([])
  const [autoMap, setAutoMap] = useState({})
  const [headerAssignments, setHeaderAssignments] = useState({})

  const [finalMap, setFinalMap] = useState({})
  const [mappedRows, setMappedRows] = useState([])
  const [summary, setSummary] = useState(null)

  const canUpload = profile?.role === 'admin' || profile?.role === 'data_master'

  const autoMappedHeaders = useMemo(
    () => parsedHeaders.filter((h) => autoMap[h]),
    [parsedHeaders, autoMap]
  )
  const unrecognizedHeaders = useMemo(
    () => parsedHeaders.filter((h) => !autoMap[h]),
    [parsedHeaders, autoMap]
  )
  const allResolved = unrecognizedHeaders.every((h) => headerAssignments[h])

  const mappingHasAssignedTo = useMemo(() => {
    const assigned = [...autoMappedHeaders.map((h) => autoMap[h]), ...Object.values(headerAssignments)]
    return assigned.includes('assigned_to')
  }, [autoMappedHeaders, autoMap, headerAssignments])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setLoading(true)

    try {
      const { headers, rows } = await parseFile(file)
      if (headers.length === 0) throw new Error('No columns found in that file.')

      const { data: mappings, error: mapError } = await supabase
        .from('column_mappings')
        .select('source_header, target_field')

      if (mapError) throw mapError

      const map = {}
      for (const m of mappings ?? []) {
        map[m.source_header] = m.target_field
      }

      const initialAssignments = {}
      headers.forEach((h) => {
        if (!map[h]) initialAssignments[h] = ''
      })

      setFileName(file.name)
      setParsedHeaders(headers)
      setParsedRows(rows)
      setAutoMap(map)
      setHeaderAssignments(initialAssignments)
      setStep('mapping')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  async function handleConfirmMapping() {
    setError(null)

    const newMappings = unrecognizedHeaders
      .filter((h) => headerAssignments[h] && headerAssignments[h] !== SKIP)
      .map((h) => ({ source_header: h, target_field: headerAssignments[h], created_by: session?.user?.id }))

    if (newMappings.length > 0) {
      const { error: insertError } = await supabase.from('column_mappings').insert(newMappings)
      if (insertError) {
        setError(`Failed to save column mappings: ${insertError.message}`)
        return
      }
    }

    const map = {}
    for (const h of parsedHeaders) {
      const assigned = autoMap[h] ?? headerAssignments[h]
      if (assigned && assigned !== SKIP) map[h] = assigned
    }

    setFinalMap(map)
    setMappedRows(parsedRows.map((row) => buildMappedRow(row, map)))
    setStep('preview')
  }

  async function handleImport() {
    setImporting(true)
    setError(null)

    const payload = mappedRows.map((r) => r.target)
    const { data, error: insertError } = await supabase.from('inspections').insert(payload).select('id')

    setImporting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    const flagged = mappedRows
      .map((r, i) => ({ ...r, rowNumber: i + 2 })) // +2: header row + 1-indexing
      .filter((r) => r.flaggedStatus)

    setSummary({ imported: data?.length ?? payload.length, flagged })
    setStep('summary')
  }

  function resetAll() {
    setStep('upload')
    setFileName('')
    setError(null)
    setParsedHeaders([])
    setParsedRows([])
    setAutoMap({})
    setHeaderAssignments({})
    setFinalMap({})
    setMappedRows([])
    setSummary(null)
  }

  if (!canUpload) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Data Upload</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don't have access to this page. Data upload is limited to Data Masters and Admins.
        </p>
      </div>
    )
  }

  const previewColumns = TARGET_FIELDS.filter(
    (f) => f.value !== 'assigned_to' && Object.values(finalMap).includes(f.value)
  )

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Data Upload</h1>
      <p className="mt-1 text-sm text-gray-500">Import inspections from a CSV or Excel file.</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {step === 'upload' && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <label className="block text-sm font-medium text-gray-700">Choose a file</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
            className="mt-2 block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
          {loading && <p className="mt-3 text-sm text-gray-500">Reading file...</p>}
        </div>
      )}

      {step === 'mapping' && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-gray-500">
            File: <span className="font-medium text-gray-700">{fileName}</span> · {parsedRows.length} rows
          </p>

          {mappingHasAssignedTo && (
            <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Known limitation: Primary Inspector mapping doesn't yet resolve names to inspector accounts, so
              that column will be skipped when rows are imported.
            </p>
          )}

          {autoMappedHeaders.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Auto-mapped columns</h2>
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                {autoMappedHeaders.map((h) => (
                  <li key={h}>
                    <span className="text-gray-900">{h}</span> →{' '}
                    {TARGET_FIELD_META[autoMap[h]]?.label ?? autoMap[h]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unrecognizedHeaders.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Unrecognized headers — map or skip each one</h2>
              <div className="mt-3 space-y-3">
                {unrecognizedHeaders.map((h) => (
                  <div key={h} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-gray-900">{h}</span>
                    <select
                      value={headerAssignments[h] ?? ''}
                      onChange={(e) =>
                        setHeaderAssignments((prev) => ({ ...prev, [h]: e.target.value }))
                      }
                      className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      <option value="" disabled>
                        Choose a column...
                      </option>
                      <option value={SKIP}>Skip this column</option>
                      {TARGET_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMapping}
              disabled={!allResolved}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirm mapping
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-gray-500">
            Previewing the first 10 of {mappedRows.length} rows. Statuses that couldn't be matched are
            flagged and default to "active".
          </p>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    {previewColumns.map((col) => (
                      <th key={col.value} className="px-4 py-2 font-medium">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mappedRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {previewColumns.map((col) => (
                        <td key={col.value} className="px-4 py-2 text-gray-700">
                          {col.value === 'status' && row.flaggedStatus ? (
                            <span className="inline-flex items-center gap-1">
                              {row.target.status}
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                needs review
                              </span>
                            </span>
                          ) : (
                            String(row.target[col.value] ?? '—')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${mappedRows.length} rows`}
            </button>
          </div>
        </div>
      )}

      {step === 'summary' && summary && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-900">{summary.imported} rows imported.</p>
            {summary.flagged.length > 0 ? (
              <>
                <p className="mt-2 text-sm text-amber-700">
                  {summary.flagged.length} row{summary.flagged.length === 1 ? '' : 's'} flagged for review —
                  status value didn't match a known result and defaulted to "active":
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  {summary.flagged.map((r, i) => (
                    <li key={i}>
                      Row {r.rowNumber}
                      {r.target.invoice ? ` (invoice ${r.target.invoice})` : ''}: got "
                      {String(r.statusOriginal ?? '')}"
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No rows needed review.</p>
            )}
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Upload another file
          </button>
        </div>
      )}
    </div>
  )
}
