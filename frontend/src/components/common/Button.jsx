import React, { useState } from 'react'

export default function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  children,
  fullWidth,
  type = 'button',
  className = '',
  style = {}
}) {
  const [hovered, setHovered] = useState(false)

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: 'Inter,sans-serif',
    fontWeight: 500,
    fontSize: size === 'sm' ? 13 : 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'all 0.15s',
    borderRadius: 10,
    height: size === 'sm' ? 32 : 40,
    padding: size === 'sm' ? '0 12px' : '0 16px',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
    textDecoration: 'none'
  }

  const variants = {
    primary: { background: hovered && !disabled ? '#2547d0' : '#335cff', color: '#fff' },
    outline: {
      background: hovered && !disabled ? '#181b25' : 'transparent',
      border: '1px solid #2b303b',
      color: hovered && !disabled ? '#fff' : '#99a0ae'
    },
    danger: { background: hovered && !disabled ? '#c02235' : '#e93544', color: '#fff' },
    ghost: { background: hovered && !disabled ? '#181b25' : 'transparent', color: '#99a0ae', border: 'none' }
  }

  return (
    <button
      type={type}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...style }}
      className={className}
    >
      {children}
    </button>
  )
}
