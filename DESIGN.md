---
name: Vele
description: The booking sheet on a seminar-room door. Bookings are printed; Vele's suggestions are written in marker until you say yes.
colors:
  desk: "#f3f6f9"
  band: "#eef3f8"
  paper: "#fbfcfd"
  paper-banded: "#f3f6f9"
  sheet: "#ffffff"
  wash: "#eef3f8"
  rule: "#d9e2ec"
  rule-faint: "#eaf0f5"
  rule-strong: "#b9c6d4"
  ink: "#1c2433"
  ink-soft: "#33405a"
  graphite: "#5b626b"
  graphite-soft: "#6e757d"
  pencil: "#7a8189"
  red-ink: "#e4572e"
  red-ink-text: "#b53a17"
  red-wash: "#fdece6"
  green-ok: "#1e6a4a"
  amber: "#9a5b00"
  amber-wash: "#fbf1dc"
  tape: "#1c2433"
  tape-text: "#fbfcfd"
  ink-blue-black: "#2447a3"
  ink-green: "#1e6146"
  ink-oxblood: "#7a2e3b"
  ink-sepia: "#6b4b24"
  ink-violet: "#4b3d91"
  ink-teal: "#0f5f6b"
  ink-graphite: "#5a5f68"
typography:
  display:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
  micro:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.35
  tape:
    fontFamily: "Libre Franklin, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.12em"
  marker:
    fontFamily: "Kalam, Segoe Print, cursive"
    fontSize: "13px"
    fontWeight: 700
  code:
    fontFamily: "Source Code Pro, ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  none: "0px"
  sm: "2px"
  lg: "3px"
spacing:
  band-inset: "6px"
  row: "10px"
  section: "40px"
  hour: "52px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
  button-pencil:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.red-ink-text}"
    rounded: "{rounded.sm}"
    height: "36px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    typography: "{typography.body}"
    height: "36px"
    padding: "0 12px"
  band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  tape-label:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-text}"
    rounded: "{rounded.sm}"
    typography: "{typography.tape}"
    height: "20px"
    padding: "0 6px"
  segmented-on:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.paper}"
    height: "32px"
---

# Design System: Vele

## Overview

**Creative North Star: "The Seminar Room Booking Sheet"**

Vele looks like the timetable taped to a seminar-room door: a printed sheet laid on a pale desk, headed by a band with the date and week number, ruled into banded rows, with each calendar's name punched out on Dymo label tape. Bookings are printed in the calendar's ink. Anything Vele suggests is written in dry-wipe marker inside a dashed, hatched outline, and it only becomes print when you confirm it. That pencil-to-print move is the product's promise made visible, so it is never softened or decorated away.

The system is institutional rather than friendly-SaaS. One gothic face at real scale steps does the work; hierarchy comes from weight and a few big jumps in size, not from colour or containers. Sections are separated by heavy printed rules, never by boxes. Corners are square, shadows are a hairline plus a one-pixel drop, and there are no gradients, glows, sparkles or rounded card stacks. The palette is the user's pinned **Ink & Pencil** set: cool paper, blue-black ink, slate rules, red ink only for "now" and corrections, and seven fountain-pen inks for calendars. Light and dark are equal: by day it's paper on a desk, by night the same sheet under a lamp.

**Key Characteristics:**
- A printed band heads every sheet and page: date, week number, title, actions.
- Sections are ruled (a 2px ink rule over a bold heading), not boxed.
- Lists and tables are banded: alternate rows on a slightly deeper paper.
- Calendar identity is a Dymo tape with a two-letter code (WK, PS, FM…).
- Vele's holds are marker (Kalam) in dashed, hatched outlines; confirmed items are printed.
- Red ink means now, today, or something struck out. Nothing else.
- Square corners (2px, 3px on sheets), flat shadows, no blur.

## Colors

A cool, near-monochrome office palette: blue-black ink on cool paper, slate rules, one red, and a drawer of fountain-pen inks that belong to calendars rather than to the interface.

### Primary
- **Blue-Black Ink** (`ink`): all text of consequence, primary buttons, the selected day, active segmented tabs, the heavy section rules (in its softer form, `ink-soft`). This is the interface's only "brand colour".
- **Soft Ink** (`ink-soft`): secondary text that still has to read as print; section rules, outlines on secondary buttons, header-band sub-lines.

### Secondary
- **Correction Red** (`red-ink`, text-safe `red-ink-text`): the now line and its dot, today's underline in every calendar, destructive borders, struck-out bookings, errors. Rare by design.

### Tertiary
- **Fountain-Pen Inks** (`ink-blue-black`, `ink-green`, `ink-oxblood`, `ink-sepia`, `ink-violet`, `ink-teal`, `ink-graphite`): calendar colours only. They fill Dymo tapes and tint booking cells (16% ink on paper, 70% ink for the cell's rule). Never used for interface chrome.

### Neutral
- **Desk** (`desk`): the page ground behind sheets; also the rail and bottom navigation.
- **Header Band** (`band`): printed bands at the head and foot of sheets, table header rows, the grid's day header.
- **Paper** (`paper`) and **Banded Paper** (`paper-banded`): the sheet itself and every other row of a banded list.
- **Wash** (`wash`): hover on rows and today's column.
- **Slate Rules** (`rule`, `rule-faint`, `rule-strong`): row dividers, hour lines (strong), half-hour lines (faint).
- **Graphite** (`graphite`, `graphite-soft`) and **Pencil** (`pencil`): meta text, hint text, the dashed outline of a hold.
- **Status** (`green-ok`, `amber`, `amber-wash`, `red-wash`): booked confirmation, flagged options, alerts.

Dark mode keeps every role and swaps values (desk `#0b0f16`, band `#18222f`, paper `#0e131b`, ink `#e7edf4`, red `#f06a43`, inks lightened to `#8fb0ff`, `#7cc7a2`, `#e39aa6`, `#d8b07a`, `#b5a8ff`, `#72c6d3`, `#a8b0bb`). Tape inverts to light tape with dark type.

### Named Rules
**The Red Is Now Rule.** Red ink marks the present moment, today, and corrections. It is never an accent, a CTA colour, or decoration.

**The Inks Belong To Calendars Rule.** Fountain-pen inks colour only calendar data: tapes and booking cells. Interface chrome stays ink, slate and paper.

## Typography

**Display / Body Font:** Libre Franklin (with ui-sans-serif, system-ui)
**Marker Font:** Kalam (with Segoe Print, cursive)
**Code Font:** Source Code Pro (with ui-monospace)

**Character:** Franklin is the gothic printed on university forms, signage and door sheets: bold weights for anything you scan, regular for anything you read. Kalam appears only as Vele's marker handwriting on provisional holds. Source Code Pro appears only for URLs, codes and ids.

### Hierarchy
- **Display** (800, 60px, 0.98): the landing headline on wide screens. Nowhere in the app.
- **Headline** (800, 40px, 1.02): Today's date and clock on desktop, the landing headline on phones.
- **Title** (800, 30px, 1.08): page titles in header bands, landing section heads, booking-page titles.
- **Lead** (800, 19px, 1.3): section heads under a rule, the calendar toolbar title, dialog titles, event titles in details.
- **Body** (400–700, 15px, 1.5): reading text and form input. Measure capped at 55ch (about 75 characters in Franklin).
- **Label** (600–800, 13px, 1.4): buttons, field labels, list meta, table cells.
- **Micro** (700–800, 12px, 1.35): hour labels, week numbers, weekday heads, timestamps. The floor: nothing is set smaller.

### Named Rules
**The Seven Steps Rule.** Sizes come only from the seven steps (12, 13, 15, 19, 30, 40, 60px). No arbitrary pixel sizes.

**The Marker Is Provisional Rule.** Kalam is used only for things Vele has written that aren't booked yet. The moment something is confirmed it is set in Franklin.

## Layout

The app is a desk with sheets on it. On desktop: a 240px directory rail on the desk, the page as a sheet, and Vele's memo as a 372px sheet at the right, separated by 12px of desk. Each page starts with a printed band inset 6px inside its sheet (title, sub-line, actions). Content sits in a centred column (max 896px for Bookings, 1024px for Settings) with 40px between ruled sections.

The time grid uses 52px hours with strong hour rules and faint half-hour rules, a 56px gutter whose band corner carries the week number, a 1.5px ink rule down the left edge, off-hours on banded paper, and today's column washed. Month view is a wall planner with a band of weekdays and "Wk n" on each Monday.

On phones (below 768px) the rail becomes a bottom bar on the desk, sheets go edge to edge with square corners, the calendar opens on Day with a full-width view switcher, and headings shorten (Sat 19 Sep).

## Elevation & Depth

Flat. A sheet is lifted from the desk by a hairline and a one-pixel drop, never a soft glow. Depth comes from the desk/sheet/band layering and from rules, not from shadows.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 0 0 1px rgb(28 36 51 / .14), 0 2px 0 rgb(28 36 51 / .22)`): sheets, popovers, dialogs, toasts.
- **Lift** (`box-shadow: 0 0 0 1px rgb(28 36 51 / .12), 0 1px 0 rgb(28 36 51 / .2)`): the active item in the rail and in the conversation history.

### Named Rules
**The No Glow Rule.** No blur radius on any shadow, no backdrop blur, no gradients. If something needs to stand out, give it a rule or a band.

## Shapes

Square. Controls, tapes, bands and holds use 2px corners; sheets and the command palette use 3px; booking cells on the grid are fully square, outlined all round in their ink. The only round things are the now-line's dot and radio indicators. Borders are 1px slate for rows, 1.5px ink for controls and printed boxes, 2px ink for section rules, dashed 1.5px pencil for holds.

## Components

### Buttons
Printed and plain: bold label, square corners, no icons unless they carry meaning.
- **Shape:** 2px corners; heights 32 / 36 / 48px (sm / md / lg).
- **Primary:** blue-black ink fill with paper type; hover shifts to soft ink. One per view.
- **Secondary:** paper with a 1.5px soft-ink outline; hover washes.
- **Ghost:** text only; hover washes. Used for row actions and toolbar icons.
- **Pencil:** dashed pencil outline for "add another" actions.
- **Danger:** paper with a red outline and red text; hover red wash.
- **Focus:** a 2px outline in 70% blue-black at 2px offset, on every interactive element.

### Tapes (Dymo labels)
- **Style:** calendar ink fill, paper type, 12px extra-bold uppercase at 0.12em tracking, 20px tall, an inset highlight and emboss line.
- **Use:** two-letter calendar codes beside events and in the calendar list; the VELE wordmark is a 28px tape.

### Holds (Vele's marker)
- **Style:** dashed 1.5px pencil outline over 45° hatching, Kalam 700 in graphite, letter chip (A, B, C) in a small square.
- **Flagged:** amber outline when an option breaks a preference.
- **Confirmed:** replaced by a printed booking cell with a 640ms ink-in.

### Booking cells
- **Style:** square, an even 1.5px outline in 70% calendar ink (no accent edge), 16% ink wash, title in bold ink, time in soft ink. Past cells drop to 60% opacity.

### Bands and section rules
- **Band:** band fill, ink type, inset 6px in its sheet, 2px corners. Carries the page title (title size), a soft-ink sub-line, and actions.
- **Section head:** a 2px soft-ink rule, lead-size heading beneath, optional action at the right.

### Product films (landing page)
- **What:** a looping, scripted miniature of the real app on a sheet: a pointer travels to measured targets, clicks (a small ink ring), types, and the UI responds exactly as the product does. Holds appear in marker; confirmed items print with the ink-in.
- **Controls:** a play/pause button and three numbered chapter bars that fill as the film plays and seek when clicked.
- **Motion rules:** plays only while at least a third of it is on screen; loops with a 0.5s fade through paper; with reduced motion it holds a representative still frame and plays only if the viewer presses play.
- **Accessibility:** the stage is hidden from assistive tech; a caption describes what happens.

### Inputs / Fields
- **Style:** paper, 1px slate outline, 2px corners, 36px tall, body type.
- **Focus:** outline turns soft ink with a 1px ring of the same colour.
- **Error:** red outline and ring; message in red text below. Labels are 13px bold soft ink above the field.

### Navigation
- **Rail:** desk ground, label-size items with icons; active item is a paper tab with the lift shadow. Calendar list shows tapes; the month shows week numbers with today underlined in red.
- **Segmented control:** a 1.5px ink-outlined strip of printed tabs; the active tab is filled soft ink.
- **Mobile:** bottom bar on the desk with the Vele tape at the centre.

## Do's and Don'ts

### Do:
- **Do** head every page and sheet with a printed band (band fill, inset 6px, 2px corners).
- **Do** separate sections with a 2px ink rule and a lead-size bold heading.
- **Do** band long lists and tables, one row per item, 1px slate dividers.
- **Do** mark calendars with Dymo tape codes and colour booking cells from the calendar's ink.
- **Do** write Vele's suggestions in Kalam inside dashed hatched outlines, and print them when confirmed.
- **Do** keep reading text to 55ch.
- **Do** show week numbers wherever a week is shown.
- **Do** explain features on the landing page with a product film and a sentence, not with paragraphs, tables or feature grids.

### Don't:
- **Don't** use rounded card stacks, pill chips, or cards inside cards.
- **Don't** use sparkle or wand icons, gradients, glows, blur or soft shadows.
- **Don't** use red for anything but now, today and corrections.
- **Don't** use calendar inks for buttons, links or chrome.
- **Don't** use Kalam for anything confirmed, or Source Code Pro for anything but codes and URLs.
- **Don't** put a thick coloured stripe on the side or top of a rounded box.
- **Don't** set text smaller than 12px or off the seven-step scale.
