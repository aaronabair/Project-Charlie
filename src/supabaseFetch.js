// Supabase/PostgREST caps a single select at 1000 rows and truncates silently.
// fetchAllRows pages through with .range() until a page comes back short, so
// every matching row is loaded.
//
// buildQuery must return a FRESH query builder each call (builders mutate as
// you chain), with select/filters/ordering already applied, e.g.:
//
//   const { data, error } = await fetchAllRows(() =>
//     supabase.from('inspections').select('id, ...').order('created_at', { ascending: false })
//   )
//
// 'id' is always appended as the final sort key. Any ordering the caller set
// stays primary (so display order is unchanged); id just breaks ties so pages
// never overlap or skip rows.
//
// Returns { data, error } like a normal Supabase query. On error, data is null.

const PAGE_SIZE = 1000

export async function fetchAllRows(buildQuery) {
  const all = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: null, error }

    all.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return { data: all, error: null }
}
