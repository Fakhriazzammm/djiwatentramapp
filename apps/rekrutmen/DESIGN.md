---
version: alpha
name: Recruitment App Admin
description: Compact Apple-inspired recruitment workspace for read-only outsourcing operations.
colors:
  primary: "#2867F0"
  neutral: "#F6F7F9"
  surface: "#FFFFFF"
  text: "#17191D"
  muted: "#747B87"
  border: "#E5E8ED"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.055em"
  body:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: 13px
  card: 18px
  sheet: 24px
spacing:
  xs: 8px
  sm: 12px
  md: 18px
  lg: 24px
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: 40px
  surface-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: 18px
---

## Overview

The standalone outsourcing admin is a calm, compact, read-only workspace. It uses a restrained blue accent, white surfaces, quiet separators, soft elevation, and a clear sidebar-to-content hierarchy. The interface should feel like a focused iOS/macOS operations app rather than a generic SaaS template.

## Colors

Blue is reserved for active navigation, primary actions, focus, and links. Green, amber, and red are semantic status colors only. No gradients, decorative illustrations, or mixed icon families are used.

## Typography

Plus Jakarta Sans is used for display and section hierarchy. DM Sans is used for readable operational data, controls, and table content.

## Layout

Desktop uses a 230px restrained sidebar and a centered content workspace. Mobile converts the sidebar into a horizontal navigation rail. Tables remain readable with horizontal scrolling; candidate details use an iOS-style right sheet.

## Elevation & Depth

Use a single soft shadow: `0 12px 34px rgba(19, 28, 45, .06)`. Borders are preferred over heavy shadows. Sheets use a stronger shadow only to communicate separation from the workspace.

## Shapes

Cards use 18px radius, major sheets use 24px, and controls use 13px. Interactive targets remain at least 40px high on desktop and comfortable on touch screens.

## Components

Every page has one clear title, one primary content surface, and a limited number of actions. Export actions are secondary. Outsourcing access is read-only; mutations are not rendered in this surface.

## Do's and Don'ts

- Do keep candidate data dense but scannable.
- Do preserve accessible labels, focus states, and reduced-motion behavior.
- Do use real API data and explicit empty/error states.
- Don't use emoji as interface icons.
- Don't add decorative cards that do not support a recruitment decision.
- Don't expose mutation controls to outsourcing users.
