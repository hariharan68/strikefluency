Build a responsive finance/banking dashboard web app with the exact visual design system described below. Use React + Tailwind CSS (or plain CSS with these tokens as CSS variables).

## OVERALL STYLE
Dark-mode-first fintech dashboard. Flat, minimal, card-based layout with soft 1px borders (no heavy shadows), rounded corners, and a single vivid blue accent color against a near-black background. Font: Inter (400/500 weights only — this UI never uses bold 700).

## COLOR TOKENS (hex, extracted from computed CSS variables)
Background:
- --bg-page: #0e121b   (main page/app background, also "static-black")
- --bg-surface: #0e121b (card backgrounds — same as page, cards are separated by border only, not color)
- --bg-weak: #181b25   (hover states, subtle recessed backgrounds, sidebar active item)
- --bg-soft: #2b303b   (slightly raised elements, track backgrounds e.g. progress bar unfilled)
- --bg-sub: #525866    (disabled fills)

Borders:
- --border-soft: #2b303b   (default card/divider border, used as `ring-1 ring-inset`)
- --border-sub: #525866
- --border-strong: #ffffff (rare, high-emphasis outline)

Text:
- --text-strong: #ffffff   (headings, primary numbers)
- --text-sub: #99a0ae      (secondary text, labels, nav item default)
- --text-soft: #717784     (tertiary/placeholder text)
- --text-disabled: #525866

Brand / Primary:
- --primary-base: #335cff   (buttons, active nav icon, links, primary chart series)
- --primary-dark: #1f3bad
- --primary-darker: #2547d0 (button hover state)
- --primary-alpha-16: rgba(51,92,255,0.16) (tinted backgrounds e.g. active icon chip)

Status colors:
- --success-base: #1daf61
- --success-text: #3ee089   (text on translucent success pill)
- --success-bg: rgba(31,193,107,0.24)  (translucent pill background, e.g. "+5%")
- --error-base: #e93544
- --error-text: #ff6875     (text on translucent error pill)
- --error-bg: rgba(251,55,72,0.24)     (translucent pill background, e.g. "-3%")
- --warning-base: #e97d35

Chart accent palette (used for stacked bar/multi-series charts):
- Blue (Income): #335cff
- Cyan/Sky (Expenses): #35ade9
- Purple (Scheduled): #7d52f4
- Unfilled bar track: #181b25 / #2b303b

Static:
- --static-white: #ffffff
- --static-black: #0e121b

## TYPOGRAPHY SCALE (Inter font, all weights 400 or 500 — never bolder)
- title-h4: 32px / 40px line-height / weight 500 → big dollar amounts, hero numbers
- title-h5: 24px / weight 500 → section headline numbers
- label-lg: 18px / 24px / weight 500 → card headers ("My Cards", "Budget Overview")
- label-md: 16px / 24px / weight 500 → nav items, buttons
- label-sm: 14px / 20px / weight 500 → secondary buttons, table headers
- label-xs: 12px / 16px / weight 500 → small pills/badges
- paragraph-sm: 14px / 20px / weight 400 → body/description text
- paragraph-xs: 12px / 16px / weight 400 → helper/meta text
- subheading-xs: 12px / 16px / weight 500, uppercase, letter-spacing wide → section group labels like "MAIN", "OTHERS", "RECENT TRANSACTIONS"
- subheading-2xs: 11px / 12px / weight 500, uppercase → tiny stat labels ("INCOME", "EXPENSES")

## LAYOUT STRUCTURE
Fixed left sidebar + fluid main content area (classic dashboard shell).

Sidebar (fixed, left: 0, width: 272px, full height, background #0e121b, right border 1px #2b303b):
1. Top: 40px logo icon (rounded, gradient blue) + app name "Apex" (label-md, white) + subtitle "Finance & Banking" (paragraph-sm, #99a0ae) + a small chevron toggle button on the right, all in a row
2. Horizontal divider
3. Nav group "MAIN" (subheading-xs, uppercase, muted) containing nav links: Dashboard, My Cards, Transfer, Transactions, Payments, Exchange — each is a full-width row (padding 8px 12px, rounded-lg 8px), icon + label, default text color #99a0ae, active/current item gets background #181b25 and white text with a trailing chevron
4. Nav group "OTHERS": Settings, Support (same style, disabled-looking items use #525866 text)
5. Bottom-pinned user profile row: avatar (36-40px circle) + name with verified checkmark badge + email (paragraph-sm, muted) + trailing chevron, separated from nav by a divider

Main content area (margin-left: 272px on desktop, full width below lg breakpoint with sidebar becoming a hidden/off-canvas drawer):
1. Top header bar: user avatar + "Welcome back to Apex 👋" greeting (label-md name in white, paragraph-sm greeting in muted grey) on left; search icon, notification bell icon (with red dot badge), and a filled primary "Move Money ↗" button (blue #335cff, white text, rounded-10px, height 40px) on the right
2. Content grid below header, built from independent rounded-2xl (16px radius) panels, each styled: background #0e121b, 1px inset ring border #2b303b, subtle shadow (shadow-regular-xs: 0 1px 2px rgba(10,13,20,0.03)), padding 16-20px
3. Panel: "My Cards" — tab switcher (Virtual / Physical pill tabs), an animated flippable credit-card visual (dark card, ~188px tall, rounded-2xl, contactless icon, status pill "Active" in success green, card network logo, masked card number, balance in title-h4), rows of Card Number / Expiry / CVC / Spending Limit with right-aligned values, three outline buttons (Unhide, Adjust Limit, More), then a "RECENT TRANSACTIONS" mini-list (icon + title/subtitle + amount + date + chevron) and a "See All Transactions" full-width outline button
4. Panel: "Budget Overview" — legend dots (purple=Scheduled, cyan=Expenses, blue=Income) + period dropdown ("Last Year"), three stat blocks (icon chip + subheading-2xs label + title-h5 value + colored % pill), then a stacked bar chart (12 months, 3-color stacked segments, rounded bar tops, y-axis gridlines 0/15K/30K/45K/60K)
5. Panel: "Spending Summary" — half-donut/gauge chart (blue-to-cyan gradient arc) with centered "SPEND" label + dollar value, below it 3 category icon-chips (Shopping/Utilities/Others) with amounts, and a muted info banner strip at the bottom ("Your weekly spending limit is $2000" with info icon)
6. Panel: "Exchange" — currency selector row (flag icon + code + chevron, swap icon in middle, second currency), large input-style amount display, available balance line, conversion rate line, breakdown rows (Tax, Exchange fee, Total amount), and a full-width primary "Exchange" button
7. Panel: "Credit Score" — donut/speedometer style score meter, "Your credit score is 710" sentence (bold number inline), qualitative label ("This score is considered to be Excellent"), user avatar marker on the arc, segmented progress bar below, "Details" outline button top-right
8. Panel: "Major Expenses" — horizontal bar chart per category (Housing/Utilities/Food) with colored bars against a 0–10K gridlines axis, period dropdown top-right
9. Panel: "Recent Transactions" (table view) — search input with ⌘1 shortcut hint, sortable column headers (checkbox, To/From, Amount, Account, Date & Time, Payment Method), each row has avatar/icon + name + amount (green if positive, white if neutral) + account tag + date + payment-method icon+label, horizontally scrollable on narrow widths

## COMPONENT STYLING DETAILS
- Buttons (primary): background #335cff, white text, height 40px, border-radius 10px, label-sm weight 500, hover background #2547d0, subtle focus ring shadow
- Buttons (outline/secondary): transparent background, 1px border #2b303b, white or muted text, same radius/height, hover background #181b25
- Pills/badges: fully rounded (border-radius 9999px), height 20px, horizontal padding 8px, label-xs text, colored translucent background matching status (success/error/info) with solid-tinted text
- Cards/panels: border-radius 16px, 1px inset ring border #2b303b, no heavy drop shadows, background matches page (#0e121b) so separation comes purely from the border + shadow-regular-xs
- Dropdowns/selects: same outline-button styling with a chevron-down icon
- Icons: 16-20px line icons (outline style, not filled), color inherits from text-sub (#99a0ae) unless active/primary
- Dividers: 1px solid #2b303b (border-soft)

## RESPONSIVENESS (breakpoints confirmed from site's actual media queries)
Breakpoints used: 390px, 420px, 480px, 560px, 640px, 768px, 1024px, 1300px, 1400px (Tailwind-style min-width stacking).
- Below 1024px (lg): sidebar is hidden by default and becomes an off-canvas/collapsible drawer (toggle via the chevron button near the logo); main content becomes full width with no left margin
- Below 1024px: multi-column panel grids (e.g. Budget Overview + side panels, Spending Summary + Exchange, Credit Score + Major Expenses) collapse from 2-column to a single stacked column
- The primary "Move Money" header button is hidden on smaller viewports (visible only at lg and above) — consider replacing with an icon-only button on mobile
- Data table (Recent Transactions) becomes horizontally scrollable on narrow viewports rather than reflowing columns
- Card/tab switcher and stat rows wrap or stack vertically on mobile widths
- Maintain generous 16-24px gutter padding on mobile, scaling up to the panel's internal 16-20px padding on desktop
- Use a fluid/grid layout (CSS grid with `grid-template-columns: repeat(auto-fit, minmax(...))` or Tailwind's responsive grid classes) so panels reflow naturally between the documented breakpoints rather than using fixed pixel widths for panels

## IMPLEMENTATION NOTES
- Use CSS variables for every color token above so a light theme could be swapped in later (the underlying design system supports both, this is the dark variant)
- Do not use any font-weight above 500 anywhere in the UI
- Keep corner radii consistent: 8px for small nav rows, 10px for buttons, 16px for panels/cards, full pill (9999px) for badges/tabs
- All charts should use flat fills, no gradients except the Spending Summary gauge arc (blue → cyan gradient)