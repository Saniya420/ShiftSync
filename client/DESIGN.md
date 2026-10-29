---
name: ShiftSync
description: Weekly rosters for small shops, set like a till roll.
colors:
  ink: '#1b1d21'
  paper: '#f3f4f5'
  slip: '#ffffff'
  text: '#31363d'
  text-muted: '#555c64'
  text-faint: '#636a73'
  rule: '#dcdfe3'
  rule-strong: '#c3c8ce'
  stamp: '#4a40a8'
  stamp-wash: '#f3f2fb'
  stamp-ink: '#332c74'
  trouble: '#b91c1c'
  trouble-wash: '#fef2f2'
  pending: '#78350f'
  pending-wash: '#fffbeb'
typography:
  display:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontSize: '3.75rem'
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: '-0.03em'
  heading:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontSize: '2.125rem'
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: 'Azeret Mono, ui-monospace, monospace'
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.01em'
  stamp:
    fontFamily: 'Azeret Mono, ui-monospace, monospace'
    fontSize: '0.6875rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.025em'
rounded:
  stamp: '2px'
  control: '6px'
  card: '10px'
  dialog: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.slip}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  button-secondary:
    backgroundColor: '{colors.slip}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  card:
    backgroundColor: '{colors.slip}'
    rounded: '{rounded.card}'
    padding: '24px'
  stamp-ok:
    backgroundColor: '{colors.stamp-wash}'
    textColor: '{colors.stamp-ink}'
    typography: '{typography.stamp}'
    rounded: '{rounded.stamp}'
  stamp-bad:
    backgroundColor: '{colors.trouble-wash}'
    textColor: '{colors.trouble}'
    typography: '{typography.stamp}'
    rounded: '{rounded.stamp}'
  nav-rail:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.slip}'
    width: '240px'
---

# ShiftSync design system

## Overview

ShiftSync is set like a till roll. A shop's week is a list of work that adds up, so lists close with a
printed tally, trouble prints in the roll's red, and confirmations land as a violet rubber stamp. The
canvas is cool thermal paper with white slips on it. A thermal-black rail holds navigation. Expression stays
in type, three inks and the tally; layouts, navigation and controls are standard web app parts.

Source of truth for tokens: the `@theme` block in `src/styles.css`. Tailwind's `slate-*` scale is
redefined there as the ink scale (slate-400 is the lightest text step and still passes 4.5:1 on paper),
and `stamp-*` is the confirmation ink.

## Colors

- **Ink** `#1b1d21`: text on slips, primary buttons, the nav rail, the double rule under totals.
- **Paper** `#f3f4f5`: page ground. **Slip** white: cards, tables, dialogs.
- **Stamp violet** `#4a40a8` family: published, approved, clocked in, focus rings, selection. Never decoration.
- **Trouble red**: conflicts, late, no-show, overtime, counts waiting on you. Reserved: nothing else is red.
- **Pending amber**: waiting states only (pending request, accepted swap).
- **Position ticks**: a 3px stripe per position (sky, teal, fuchsia, lime, cyan, pink) hashed from the position
  name. Never red, amber or orange, and never derived from row order.

## Typography

Archivo carries the UI; headings use its semi-condensed width (`font-stretch: 87.5%`, display 80%) at
weight 800, like a printed shop header. Azeret Mono with tabular figures (`.num`) sets every time, hour,
count and amount, and the stamp labels. Monospace is for figures only, never for prose. Floor: 12px for
any text, 11px only for stamps and count badges.

## Layout

Desktop: fixed 240px ink rail with grouped nav (Today, Plan, Decide, Run, You), page body max 1600px.
Phone: compact ink top bar (wordmark, notifications, Menu) and a four-tab bottom bar in thumb reach.
Every page opens with `PageHeading`: title, one plain sentence, optional mono meta line (date, zone,
counts). No eyebrow labels above headings.

## Elevation & Depth

Flat. Elevation is a 1px border, never border plus shadow. The only shadows are the dialog and the landing
page's sample roster, both soft and offset downward.

## Shapes

Stamps 2px, controls 6px, cards 10px, dialogs 12px. Draft shifts use a dashed border on a translucent slip;
published shifts are solid. Perforation is a dashed rule; a grand total sits on a 3px double rule.

## Components

- **Tally** (`.tally`, `.tally-total`): dashed top rule, mono figures right-aligned, double rule under the
  grand total. Used in roster footer, Overview week summary, publish review, timesheets, My schedule.
- **Stamp** (`<Stamp status>`): word plus tone, from `statusLabel`; raw API enums never reach the screen.
- **Needs you queue**: count + sentence + arrow rows on Overview; red count only for late/missing people.
- **Publish review**: dialog summarising drafts, people notified, open shifts, hours, labour and warnings
  before `Publish and notify`.
- **Clock slip**: next shift as a large mono time range with the clock button and PIN beneath.

## Do's and Don'ts

- Do say what happened and when ("Published Thu 10:42", "Clocked in 08:58").
- Do keep conflict reasons visible in the shift card and its accessible name, not in hover titles.
- Don't add slogans, eyebrow labels, promo cards or decorative icons.
- Don't use red, amber or violet for anything that is not a state.
- Don't nest cards; pass `inset` to `Empty` inside a card.
