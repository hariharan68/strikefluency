# PromptVault UI/UX Design Extraction

Source inspected: `frontend/src/styles/index.css`, `frontend/src/App.jsx`, `frontend/src/layouts/AppLayout.jsx`, page components, common components, prompt components, group components, and theme context.

## Product Feel

PromptVault is a quiet productivity app for storing, finding, copying, and organizing AI prompts. The implemented UI is light-first, minimal, rounded, and work-focused, with a plum accent system, soft borders, compact typography, and subtle motion. It uses cards, rows, modals, drawers, toasts, and a command palette rather than large marketing-style surfaces inside the authenticated app.

The design language is:

- Clean SaaS utility interface.
- Light neutral canvas with plum active states.
- Serif branding and page hero headings.
- Dense but readable prompt library controls.
- Smooth but restrained transitions.
- Dark mode supported across the authenticated app.

## Frontend Stack

- React 18 with Vite.
- Tailwind CSS v4 utility classes.
- `motion` / Motion React for route, modal, card, list, and palette animation.
- `@phosphor-icons/react` for all visible app icons.
- `@fontsource-variable/inter` for body/UI type.
- `@fontsource-variable/source-serif-4` for brand and high-level headings.
- React Router routes for auth and protected app pages.

## Typography

### Font Families

Defined in `frontend/src/styles/index.css`.

| Role | Font |
|---|---|
| UI/body | `Inter Variable`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif` |
| Brand/headline | `Source Serif 4 Variable`, `Georgia`, `"Times New Roman"`, `serif` |
| Code/prompt previews | Tailwind `font-mono` |

### Base Type

- Body font size: `15px`.
- Body line height: `1.5`.
- Font smoothing enabled with `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`.
- Letter spacing is mostly normal, except uppercase metadata labels use positive tracking.

### Type Scale In Use

| Use | Class/Size |
|---|---|
| Auth panel headline | `font-serif text-4xl` |
| Page heading for Dashboard/Groups/Settings | `font-serif text-3xl` |
| Auth form title | `font-serif text-2xl` |
| Prompts page title | `text-xl font-bold` |
| Section heading | `text-[13px] font-semibold uppercase tracking-[0.1em]` |
| Eyebrow label | `text-[11px] font-semibold uppercase tracking-[0.14em]` |
| Input label | `text-[11px] font-bold/semibold uppercase tracking-[0.1em-0.12em]` |
| Card title | `text-sm font-semibold` |
| Body/meta | `text-sm`, `text-xs`, `text-[10px]` |
| Prompt preview | `text-xs font-mono leading-relaxed` |

## Color System

### Light Theme Tokens

Defined as CSS variables in `:root`.

| Token | Hex | Use |
|---|---:|---|
| `--color-bg` | `#FFFFFF` | App base |
| `--color-surface` | `#FFFFFF` | Cards, modals, navbar/sidebar |
| `--color-surface2` | `#F3F4F6` | Main canvas, inputs, sunken previews |
| `--color-border` | `#E5E7EB` | Default border |
| `--color-border2` | `#D1D5DB` | Stronger border, faint icons |
| `--color-accent` | `#714B67` | Primary plum actions and active states |
| `--color-accent-d` | `#5A3A52` | Primary hover |
| `--color-accent-l` | `#9B6E93` | Gradient/light accent |
| `--color-accent-bg` | `#F3EEF3` | Active nav, tags, pills |
| `--color-text` | `#111827` | Headings |
| `--color-text2` | `#374151` | Body text |
| `--color-muted` | `#6B7280` | Secondary text |
| `--color-subtle` | `#9CA3AF` | Placeholder/meta |
| `--color-faint` | `#D1D5DB` | Inactive icons |

### Dark Theme Colors

Dark mode is controlled by toggling `.dark` on `document.documentElement` and persisting `pv-theme` in `localStorage`.

| Use | Hex |
|---|---:|
| App background | `#1A1B22` |
| Elevated surface | `#252733` |
| Sunken surface | `#2C2E3A` |
| Border | `#363847` |
| Strong hover border | `#4A4D60` |
| Dark active plum surface | `#3D2B3A` |
| Dark active plum border | `#5A3A54` |
| Dark accent text | `#C4A0BA` |
| Primary text | `#F1F2F6` |
| Muted text | `#9CA3AF`, `#6B7280` |

### Semantic and Supporting Colors

| Purpose | Colors |
|---|---|
| Success/copied | Emerald utilities, e.g. `emerald-500`, `emerald-600`, `emerald-700` |
| Error/delete | Red utilities, e.g. `red-500`, `red-600`, `red-400`, red backgrounds at `/6` to `/15` opacity |
| Variable placeholder badges | `#F2A93E`, `#D4841A` |
| Dashboard blue stat card | `#4FA8E0` to `#6EC2F5` |
| Older 404 page accent | `#6c63ff`, `#8b83ff`, `#f4f6fb`, `#232735`, `#868da3` |

### Selection and Scrollbars

- Light selection: `#714B6726` background, `#111827` text.
- Dark selection: `#714B6740` background, `#F1F2F6` text.
- Scrollbar size: `8px`.
- Light scrollbar thumb: `#D1D5DB`, hover `#9CA3AF`.
- Dark scrollbar thumb: `#363847`, hover `#4A4D60`.

## Layout System

### App Shell

Authenticated routes render inside `AppLayout`.

- Root shell: `flex h-screen overflow-hidden`.
- Sidebar: fixed on mobile, relative on desktop, width `w-60` or `240px`.
- Content column: `flex-1 flex flex-col min-w-0`.
- Navbar: fixed-height top bar, `h-14`.
- Main canvas: `flex-1 overflow-y-auto`.
- Page padding: `p-5 md:p-7`.
- Main canvas light background: `#F3F4F6`.
- Main canvas dark background: `#1A1B22`.

### Protected Routes

Routes:

- `/login`
- `/register`
- `/dashboard`
- `/prompts`
- `/groups`
- `/settings`
- fallback `/*` not found page

`/` redirects to `/dashboard`. Authenticated routes are wrapped in `ProtectedRoute`.

## Responsive Behavior

### Breakpoints In Use

| Breakpoint | Behavior |
|---|---|
| Base/mobile | One-column content, sidebar hidden off-canvas, compact navbar brand visible |
| `sm` | Prompt/group grids become two columns; selected row metadata/tags start appearing |
| `md` | Sidebar becomes persistent; navbar page title and search trigger appear; mobile hamburger hides |
| `lg` | Prompt/group grids become three columns; auth pages show split brand panel |
| `xl` | Auth brand panel narrows from `46%` to `42%` |

### Sidebar

- Mobile: `fixed top-0 left-0 h-full`, hidden with `-translate-x-full`.
- Open mobile sidebar: `translate-x-0`.
- Mobile overlay: fixed inset, `bg-[#111827]/30`, `backdrop-blur-[2px]`, visible only below `md`.
- Desktop: `md:relative md:translate-x-0`.
- Width: `w-60`.

### Auth Pages

- Mobile/tablet: only the centered form panel is shown.
- `lg` and above: split layout with left brand panel and right form panel.
- Brand panel width: `46%`, `xl:42%`.
- Form width: `max-w-[360px]`.
- Page padding: `p-6 lg:p-16`.

### Prompt and Group Grids

- Prompt grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- Group grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- Dashboard stat cards: `grid-cols-1 sm:grid-cols-3 gap-4`.
- Filters use `flex flex-wrap`, allowing controls to wrap naturally on narrow screens.

## Navigation and Shell Components

### Sidebar

Brand block:

- Icon: plum square/rounded lock, `w-8 h-8 rounded-lg`.
- Brand text: serif, `17px`, tight tracking.
- Bottom border separates the brand.

Main nav:

- Items: Dashboard, All Prompts, Groups, Settings.
- Item shape: `rounded-lg`, `px-3 py-2`, gap `3`, text `sm`.
- Active item: plum wash background, plum text, semibold.
- Inactive item: gray text, light/dark hover surface.

Quick access groups:

- Label: uppercase `Quick access`, `10px`, bold, `tracking-[0.14em]`.
- Add button: compact `w-5 h-5`.
- Inline group creation form appears in sidebar.
- Group rows show a `#` prefix in monospace `10px`.
- Row action menu appears on hover.
- Empty state: italic `No groups yet`.

Footer:

- User avatar: `w-7 h-7` circular plum wash.
- Sign out button: full width, small, bordered, red hover.

### Navbar

- Height: `h-14`.
- Background: `bg-white/90` or `dark:bg-[#1A1B22]/90`.
- Backdrop blur and bottom border.
- Desktop left: uppercase page title.
- Mobile left: hamburger plus compact brand.
- Desktop center/left action: command search trigger with search icon, text, and `⌘K` keycap.
- Right actions: theme toggle, settings icon, divider, user avatar dropdown.
- User menu: right-aligned dropdown, width `w-48`, rounded-xl, shadow, animated with `.animate-in`.

## Page Layouts

### Login Page

Desktop layout:

- Full height horizontal split.
- Left panel: dark surface `#252733`, hidden below `lg`.
- Right panel: white form area, centered form.
- Decorative blurred circles: plum and blue translucent glows.
- Brand headline: serif `text-4xl`, white.
- Feature list uses small circular plum icons with checkmarks.

Mobile layout:

- Left panel hidden.
- Centered form with mobile brand at top.
- Form max width `360px`.

Form:

- Inputs use shared `Input`.
- Submit button full width `h-10`, rounded-full, plum background.
- Loading state swaps label to spinner plus `Signing in...`.
- Error state: red text with `Warning` icon, light red background, rounded-xl.

### Register Page

Same split pattern as Login.

Left panel differences:

- Headline: `Start building your prompt library today`.
- Step list uses Archive, Folder, and Star icons in `w-9 h-9` rounded-xl boxes.

Form:

- Username, email, password.
- Submit button loading state: `Creating account...`.

### Dashboard Page

Container:

- `max-w-4xl mx-auto flex flex-col gap-10`.

Header:

- Eyebrow: `Your vault`, plum, uppercase.
- Main heading: serif `text-3xl`.
- Greeting changes by time of day.

Stat cards:

- Three gradient cards: Total Prompts, Favorites, Groups.
- Rounded-xl, padding `p-5`.
- White translucent icon square.
- Large number: `text-4xl font-bold`.
- Hover: card moves up and slightly scales.
- Loading: white translucent pulse block.

Recent prompts:

- Section heading uppercase `13px`.
- Rows are white/dark cards with border, rounded-xl, hover plum border and soft shadow.
- Shows title, optional description, favorite star, up to two tags, and date.

CTA buttons:

- Primary plum rounded-full.
- Secondary bordered rounded-full with favorite star.

### Prompts Page

Container:

- `max-w-7xl mx-auto flex flex-col gap-6`.

Header:

- Left: title and result count.
- Right: sort select, grid/list toggle, New Prompt button.
- Sort select has leading `CaretUpDown` icon.
- View toggle is a two-button segmented control with active plum wash.

Filters:

- White/dark card, border, rounded-xl, padding `p-5`.
- Flexible wrapping row.
- Controls: Search, Group select, Tag input with datalist, Favorites select.
- Active filters render as removable pills below controls.
- Clear button appears only when filters are active.

Prompt list:

- Supports grid view and list view.
- Grid view uses prompt cards.
- List view uses compact rows inside one bordered rounded-xl container.
- Loading state uses skeleton cards/rows.
- Empty state shows centered archive icon tile, heading, and helper text.

Create/edit:

- Uses `Modal` with `size="lg"`.
- Form uses `PromptEditor`.

### Groups Page

Container:

- `max-w-4xl mx-auto flex flex-col gap-8`.

Header:

- Eyebrow: `Organize`.
- Heading: serif `text-3xl`.
- Count: small muted text.
- Primary New Group button.

Group cards:

- Grid: `1 / 2 / 3` columns by breakpoint.
- Card: white/dark surface, border, rounded-xl, `p-5`.
- Folder icon tile: `w-10 h-10`, rounded-xl, plum wash.
- Three-dot menu appears on hover.
- Hover reveals `View prompts` link with arrow.
- Empty state mirrors prompt empty state.

Create/rename:

- Uses modal size `sm`.
- Shared `Input`.
- Primary and ghost buttons.

### Settings Page

Container:

- `max-w-2xl mx-auto flex flex-col gap-8`.

Header:

- Eyebrow: `Preferences`.
- Heading: serif `text-3xl`.
- Helper text.

Sections:

- Appearance, Account, About.
- Each section: white/dark card, border, rounded-2xl, overflow-hidden.
- Section header: uppercase `13px`, border bottom.
- Appearance includes segmented Light/Dark theme control.
- Account shows circular avatar and user email.
- About shows app and stack metadata.

### Not Found Page

The 404 page uses an older visual style than the rest of the app:

- Background: `#f4f6fb`.
- Purple/indigo gradient button: `#6c63ff` to `#8b83ff`.
- Large `404` text with blurred purple background.
- This page is not fully aligned with the current plum design system.

## Component System

### Button

File: `frontend/src/components/common/Button.jsx`.

Variants:

- `primary`: plum background, white text, plum shadow, hover darker plum, active scale.
- `accent`: visually same as primary with slightly stronger shadow.
- `secondary`: white/dark surface, border, hover plum border.
- `ghost`: transparent, border, hover neutral surface.
- `danger`: red text, translucent red background and border.

Sizes:

- `sm`: `px-3.5 py-1.5 text-xs rounded-full`.
- `md`: `px-4 py-2 text-sm rounded-full`.
- `lg`: `px-5 py-2.5 text-sm rounded-full`.

Shared behavior:

- `inline-flex items-center gap-1.5`.
- `transition-all duration-200`.
- Disabled: `opacity-40`, `cursor-not-allowed`, `pointer-events-none`.
- Active buttons use `active:scale-[0.98]`.

### Input

File: `frontend/src/components/common/Input.jsx`.

- Label above input if provided.
- Label: uppercase `11px`, semibold, gray.
- Input: full width, `rounded-xl`, `px-4 py-3`, `text-sm`.
- Light input background: `#F3F4F6`.
- Dark input background: `#2C2E3A`.
- Focus: plum border, plum ring `#714B67/15`, surface becomes white/dark elevated.
- Hover: stronger gray border.
- Transition: `duration-200`.

### Modal

File: `frontend/src/components/common/Modal.jsx`.

Overlay:

- Fixed inset overlay.
- Light: `#111827/40`; dark: black `/60`.
- `backdrop-blur-sm`.
- Centered content with `p-4`.
- Click outside closes.
- Escape closes.

Panel:

- Width presets: `sm=max-w-sm`, `md=max-w-lg`, `lg=max-w-2xl`.
- Surface: white/dark `#252733`.
- Border, rounded-2xl.
- Shadow: `0 25px 60px -15px rgba(17,24,39,0.2)`.
- Max height `90vh`, internal scroll.

Header:

- Left plum vertical bar.
- Small semibold title.
- Circular close button with `X` icon.

Motion:

- Overlay fades in over `0.15s`.
- Panel fades, scales from `0.96`, and slides up from `y:10` over `0.22s`.

### Toast

File: `frontend/src/components/common/Toast.jsx`.

- Position: fixed bottom-right, `bottom-5 right-5`.
- Stack: vertical with gap `2`.
- Lifetime: `3500ms`.
- Toast shape: rounded-xl, border, shadow, `pl-5 pr-6 py-3.5`.
- Types: success, error, info.
- Icon sits in `w-6 h-6` circular tinted background.
- Entry uses `.animate-in`.

### Command Palette

File: `frontend/src/components/common/CommandPalette.jsx`.

Invocation:

- `Ctrl+K` or `Meta+K` from `AppLayout`.
- Also opened by desktop navbar search trigger.

Layout:

- Fixed overlay, top-aligned at `pt-[12vh]`.
- Panel width: `max-w-xl`.
- Rounded-2xl, strong shadow, border.
- Search input header with `MagnifyingGlass`, ESC keycap, close icon.
- Result list max height: `400px`.
- Footer hints show select, navigate, close, `⌘K`.

Behavior:

- Fetches prompts on open.
- Searches pages and prompts.
- Arrow keys move selection.
- Enter navigates or copies prompt.
- Escape closes.
- Highlights matched query with plum mark.
- Copied state shows green check.

Motion:

- Overlay fade: `0.15s`.
- Panel fade/scale/slide: scale `0.97`, y `-10`, duration `0.2s`, cubic `[0.16, 1, 0.3, 1]`.

### Tag Pill

File: `frontend/src/components/tags/TagPill.jsx`.

- Inline-flex rounded-full pill.
- Padding: `px-2.5 py-0.5`.
- Font: `text-xs font-medium`.
- Background: plum wash, dark plum wash in dark mode.
- Border: `#E0D0DC` light, `#5A3A54` dark.
- Prefix: small `#`, `8px`, semi-transparent.
- If clickable, cursor pointer and hover plum tint.

### Prompt Card

File: `frontend/src/components/prompts/PromptCard.jsx`.

Shape:

- Flex column card.
- White/dark elevated surface.
- Border, rounded-xl, overflow hidden.
- Padding inside: `p-5`.
- Hover: plum border, soft plum shadow.
- Motion hover: moves up `y: -2`.

Content:

- Title line with optional description.
- Favorite star top-right.
- Variable badge if prompt contains `{{variable}}`.
- Prompt content preview in sunken monospace box, line-clamped to four lines with gradient fade.
- Tags wrap below preview.
- Action row separated by top border.
- Date and usage count on the right.

Actions:

- Copy or Use.
- Edit.
- Duplicate.
- Delete.
- Copied state turns emerald.
- Variable prompts open fill modal instead of direct copy.

### Prompt Row

File: `frontend/src/components/prompts/PromptRow.jsx`.

- Compact row inside list container.
- Favorite star at left.
- Title and description truncated.
- Variable badge supported.
- Up to two tags visible from `sm` upward.
- Usage count visible from `md`.
- Date visible from `sm`.
- Actions hidden until row hover.
- Hover changes row background.

### Prompt Editor

File: `frontend/src/components/prompts/PromptEditor.jsx`.

Fields:

- Title.
- Description.
- Prompt Content textarea.
- Group select.
- Tags comma-separated.

Layout:

- Form flex column gap `5`.
- Group and tags are two columns.
- Textarea: rounded-xl, monospaced, resize-y, `rows=8`.
- Variable helper text shown at top-right of prompt content label.
- Detected variables render as amber monospace badges.
- Error state uses red alert box with warning icon.
- Actions right-aligned: Cancel and Create/Update.
- Saving state shows spinner inside primary button.

### Prompt Fill Modal

File: `frontend/src/components/prompts/PromptFillModal.jsx`.

- Opens for prompts with `{{variable}}` placeholders.
- Generates one input per unique variable.
- Shows preview in a sunken rounded-xl monospace preview box.
- Unfilled variables are amber marks.
- Filled variables are plum marks.
- Copy button disabled until all variables are filled.
- Copied state turns green and closes after `1200ms`.

### Prompt Filters

File: `frontend/src/components/prompts/PromptFilters.jsx`.

- Filter card with wrapping controls.
- Search field includes left search icon.
- Group and Favorites use styled select controls.
- Tag input supports `datalist` suggestions.
- Active filters render removable pills.
- Favorites active pill uses amber styling.
- Clear button appears only if any filter is active.

### Group Card

File: `frontend/src/pages/GroupsPage.jsx`.

- Card uses folder icon tile.
- Shows group name and prompt count.
- Hover reveals actions menu and `View prompts`.
- Dropdown menu contains Rename and Delete.

## Motion and Animation

Global motion config:

- `MotionConfig reducedMotion="user"` respects user reduced motion preference.

CSS keyframes:

- `fadeSlideUp`: opacity `0` and `translateY(8px)` to visible at y `0`, duration used by `.animate-in` is `0.2s ease-out`.
- `shimmer`: background position moves from `-200%` to `200%` for skeleton loading.

Page transitions:

- `AnimatePresence mode="wait"` around route outlet.
- Enter: opacity `0`, y `10`.
- Animate: opacity `1`, y `0`.
- Exit: opacity `0`, y `-6`.
- Duration: `0.18s`, ease `easeOut`.

Dashboard:

- Header fades/slides up over `0.3s`.
- Stat cards stagger by `0.07s`.
- Stat hover: `y: -3`, scale `1.01`.
- Recent rows slide from `x: -8`, stagger `0.05s`.

Prompt lists:

- Grid cards enter from y `14`, duration `0.22s`, stagger up to first 8 items by `0.04s`.
- List rows enter from x `-6`, duration `0.18s`, stagger by `0.03s`.
- Prompt card hover moves up `2px`.

Sidebar:

- Mobile drawer uses transform transition `duration-250 ease-out`.
- Overlay fades `0.15s`.

Interactive states:

- Buttons use `transition-all duration-200`.
- Most hover color changes use `duration-150` or `duration-200`.
- Stars scale on hover.
- Row/card action menus fade in through opacity transitions.
- Dropdown caret rotates `180deg` when open.

Loading:

- Skeleton shimmer runs `1.5s infinite`.
- Inline spinner uses Tailwind `animate-spin`.
- Dashboard stat loading uses `animate-pulse`.

## Spacing, Radius, and Shadows

### Spacing

- App page padding: `20px` mobile, `28px` desktop via `p-5 md:p-7`.
- Sidebar brand: `px-5 py-5`.
- Sidebar nav: `px-3 py-3`.
- Navbar: `px-5 md:px-6`.
- Cards: commonly `p-5`; smaller list rows use `px-4 py-3`.
- Modal body: `px-6 py-6`.
- Modal header: `px-6 py-5`.
- Filter card: `p-5`.

### Radius

- Buttons: `rounded-full`.
- Inputs/selects/textareas: `rounded-xl`.
- Cards: `rounded-xl`.
- Modals and larger empty-state icons: `rounded-2xl`.
- Brand lock icon: `rounded-lg` or `rounded-md`.
- Small segmented controls: `rounded-lg`.

### Shadows

- Primary buttons: `0 4px 14px -4px rgba(113,75,103,0.4)`.
- Primary button hover: `0 6px 18px -4px rgba(113,75,103,0.5)`.
- Cards: no default heavy shadow; hover uses soft plum shadow.
- Stat cards: colored large shadow around `0 14px 30px -12px`.
- Modals: large centered shadow.
- Command palette: strong `0 32px 80px -16px rgba(17,24,39,0.35)`.
- Dropdowns: `0 8px/12px/24px/32px` soft shadows.

## Icons

Icon library: Phosphor Icons.

Common icon usage:

- Brand: `Lock`.
- Nav: `SquaresFour`, `Archive`, `FolderSimple`, `GearSix`.
- Search: `MagnifyingGlass`.
- Theme: `Sun`, `Moon`.
- Auth/sign out: `SignOut`.
- Prompt actions: `Star`, `Copy`, `Check`, `PencilSimple`, `CopySimple`, `Trash`.
- Menus: `DotsThree`, `CaretDown`, `CaretUpDown`.
- Modals: `X`.
- Empty states: `Archive`, `FolderSimple`.
- Keyboard hint: `ArrowElbowDownLeft`.

Icon sizes are generally compact:

- Navbar/action icons: `13px-18px`.
- Card/row action icons: `11px-16px`.
- Empty-state icons: `28px`.
- Dashboard stat icons: `18px`.

## Interaction Patterns

### Theme

- User can toggle light/dark from navbar or Settings.
- Theme stored as `pv-theme`.
- Default theme: `light`.

### Searching

- Primary search affordance is command palette.
- Prompt page also has filter-card search.
- URL search params are source of truth for prompt filters.

### Sorting and Views

Prompts can be sorted by:

- Newest first.
- Oldest first.
- Most used.
- A to Z.
- Z to A.

Prompts can be displayed as:

- Grid cards.
- Compact list rows.

### Prompt Copying

- Direct copy for normal prompts.
- Fill-in modal for prompts containing `{{variable}}`.
- Copy increments usage count through API.
- Copied state appears inline as green feedback.

### CRUD Feedback

- Create/update/delete/duplicate/favorite actions use toast messages.
- Destructive prompt/group deletion uses native `window.confirm`.
- Form errors render inline red boxes.

### Empty States

Prompts:

- Centered archive icon tile.
- Title: `No prompts found`.
- Helper: `Try adjusting your filters or create your first prompt`.

Groups:

- Centered folder icon tile.
- Title: `No groups yet`.
- Helper text plus New Group button.

Dashboard first-run:

- Card prompting user to create first prompt.

## Accessibility Notes

Implemented:

- Semantic buttons and forms.
- Input labels are rendered for shared inputs.
- Modal closes on Escape.
- Command palette keyboard navigation with arrows, Enter, Escape.
- Theme respects system reduced motion setting through MotionConfig.
- Many icon buttons include `title`.

Gaps / follow-up:

- Some icon-only buttons use `title` but not explicit `aria-label`.
- Modal focus trapping is not implemented.
- Modal initial focus is partial: command palette focuses input, but generic modal does not.
- Native confirm dialogs are used for destructive actions.
- 404 page visual system is inconsistent with current plum theme.

## Current Design Risks

- `Docs/06_UI_UX_Documentation.md` is stale. It describes an older dark-only purple design and does not match the implemented plum, light-first UI.
- The 404 page still uses the older indigo palette.
- The auth pages include decorative blurred glow circles, while the authenticated app avoids decorative background effects.
- `PromptEditor` uses a two-column group/tag grid without an explicit mobile collapse class, so very narrow screens may feel tight.
- The app is responsive, but some hover-revealed actions in rows/cards may be less discoverable on touch devices.

## Design Summary

PromptVault currently ships as a polished, compact prompt-management interface with:

- Light-first theme and complete dark mode support.
- Plum-led accent palette.
- Inter UI typography plus Source Serif brand/headline typography.
- Fixed desktop sidebar and mobile drawer navigation.
- Top navbar with command palette, theme toggle, settings, and user menu.
- Dashboard stat cards, recent prompt rows, prompt grid/list modes, group cards, settings panels, and auth split screens.
- Motion-based route transitions, modals, command palette, card hover, and staggered list/grid entrances.
- Skeleton loaders, toasts, empty states, inline form errors, and copied feedback.
