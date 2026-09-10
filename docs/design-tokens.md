# BezaMint — Design Tokens

All colors are defined as Tailwind v4 theme tokens in `apps/web/src/styles/globals.css`
under `@theme`. Components must reference these tokens — never raw hex values in
`className`. A test (`apps/web/src/lib/__tests__/design-tokens.test.ts`) fails CI
when a component introduces arbitrary hex values like `bg-[#123456]`.

## Palette

| Token                        | Dark      | Light     | Usage                                       |
| ---------------------------- | --------- | --------- | ------------------------------------------- |
| `--color-bezamint-primary`   | `#24a563` | `#168a4e` | Primary actions, links, focus rings         |
| `--color-bezamint-secondary` | `#7cd9a3` | `#15803d` | Accent text, active states, verified badges |
| `--color-bezamint-accent`    | `#47c07d` | `#24a563` | Hover state of primary buttons              |
| `--color-bezamint-dark`      | `#06271a` | `#06271a` | Deep brand background                       |
| `--color-bezamint-light`     | `#eefbf3` | `#eefbf3` | Brand light surface                         |
| `--color-bezamint-surface`   | `#0a0f1a` | `#f6f8fb` | Page background                             |
| `--color-bezamint-card`      | `#111827` | `#ffffff` | Card/panel background                       |
| `--color-bezamint-muted`     | `#374151` | `#eef2f7` | Input backgrounds, subtle fills             |
| `--color-bezamint-border`    | `#1f2937` | `#e2e8f0` | Borders, dividers                           |

## Usage rules

1. **No raw hex in components.** Use `bg-bezamint-*`, `text-bezamint-*`,
   `border-bezamint-*` utilities. Semantic text levels use Tailwind's
   `text-gray-*` scale (200/300/400/500/600).
2. **Semantic choice, not palette choice.** Prefer tokens by intent: primary
   for actions, card for surfaces, muted for inputs.
3. **Light theme** is applied automatically via `[data-theme='light']` token
   overrides in `globals.css` — never hardcode a dark value to "fix" light mode.
4. **Opacity modifiers** (e.g. `bg-bezamint-primary/10`) are fine and preferred
   over inventing new colors.
5. **Component classes** (`.btn-primary`, `.input-field`, `.card`) are defined
   in `globals.css` and should be reused rather than re-declaring styles inline.

## Typography

- Font: Inter (loaded via `next/font` as `--font-inter`).
- Display: `font-bold`/`font-semibold` with `text-white` (dark) on headings.
- Body: `text-sm`/`text-base` `text-gray-400` (muted) or `text-gray-200` (primary).

## Spacing / radii

- Cards/inputs: `rounded-xl`/`rounded-2xl`; padding `p-6` on cards.
- Page gutter: `page-container` (`px-4 sm:px-6 lg:px-8 py-8`).
- Component gaps: 4-unit grid (`gap-4`, `space-y-4`).

## Focus & states

- Keyboard focus uses `focus-visible` rings (see the global rule in
  `globals.css`). Do not remove outlines without replacing them.
- Disabled controls use `disabled:opacity-50`.
