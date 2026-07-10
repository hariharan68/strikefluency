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
  const sizeClass = size === 'sm' ? 'sf-button-sm' : size === 'lg' ? 'sf-button-lg' : ''
  const variantClass = variant === 'outline' || variant === 'secondary'
    ? 'sf-btn-outline'
    : variant === 'ghost'
      ? 'sf-btn-outline sf-button-ghost'
      : variant === 'danger'
        ? 'sf-btn-outline sf-button-danger'
        : 'sf-btn-primary'

  return (
    <button
      type={type}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      className={`${variantClass} ${sizeClass} ${className}`.trim()}
      style={{ width: fullWidth ? '100%' : undefined, ...style }}
    >
      {children}
    </button>
  )
}