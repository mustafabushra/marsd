import { ReactNode } from 'react'

interface Column<T> {
  key: keyof T
  label: string
  render?: (value: any, row: T) => ReactNode
}

interface TableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  isLoading?: boolean
  emptyMessage?: string
}

export default function Table<T extends { id?: string | number }>({
  data,
  columns,
  onRowClick,
  isLoading,
  emptyMessage = 'لا توجد بيانات',
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-right">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-3 font-600 text-slate-700 text-right"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              className="border-b border-slate-200 hover:bg-slate-50 transition cursor-pointer"
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3">
                  {col.render
                    ? col.render((row as any)[col.key], row)
                    : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
