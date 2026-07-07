import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '16px 0' }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          background: page <= 1 ? 'transparent' : '#181b25',
          border: '1px solid #2b303b',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
          opacity: page <= 1 ? 0.4 : 1
        }}
      >
        <ChevronLeft size={16} color="#99a0ae" />
      </button>

      <span style={{ color: '#99a0ae', fontSize: 13 }}>
        Page {page} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          background: page >= totalPages ? 'transparent' : '#181b25',
          border: '1px solid #2b303b',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          opacity: page >= totalPages ? 0.4 : 1
        }}
      >
        <ChevronRight size={16} color="#99a0ae" />
      </button>
    </div>
  )
}
