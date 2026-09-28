// Same recipe as the magnifier, the plus and the cog: a 24 grid, a 1.1
// hairline, round caps, no fill and no chrome. It draws at 18 rather than 22
// because it sits inside a 26px target on the line's end rather than in the
// 34px corner family, and a full-size cross there reads heavier than the
// magnifier facing it across the field.

export function CrossIcon() {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.1" strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />
    </svg>
  );
}
