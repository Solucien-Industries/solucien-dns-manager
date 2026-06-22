export function Logo(props) {
  return (
    <svg viewBox="0 0 120 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" className="fill-emerald-400" />
      <text
        x="30"
        y="17"
        className="fill-zinc-900 text-[18px] font-bold dark:fill-white"
        style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      >
        Nani
      </text>
    </svg>
  )
}
