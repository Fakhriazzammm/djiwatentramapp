---
version: alpha
name: Yumme Group Corporate
description: Operator-led F&B group with calm Apple-inspired digital experience.
colors:
  primary: "#1769D1"
  secondary: "#14202B"
  tertiary: "#DCEBE4"
  neutral: "#F6F8F7"
  surface: "#FFFFFF"
  muted: "#687782"
typography:
  display:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 4rem
    fontWeight: 800
    lineHeight: 1.03
    letterSpacing: "-0.075em"
  heading:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.06em"
  body:
    fontFamily: "DM Sans"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.7
rounded:
  sm: 12px
  md: 14px
  lg: 24px
  xl: 34px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: 46px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: 46px
  major-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  page-background:
    backgroundColor: "{colors.neutral}"
  body-copy:
    textColor: "{colors.muted}"
    typography: "{typography.body}"
---

## Overview

Yumme Group is an operator-led F&B company. The landing page must feel premium, calm, capable, and practical: not a generic SaaS template and not a decorative agency page. Copy is Indonesian-first and the primary conversion is a qualified F&B business inquiry.

## Colors

- **Primary (#1769D1):** restrained azure accent for action, links, and focus.
- **Secondary (#14202B):** deep ink for brand confidence, hero text, and dark sections.
- **Tertiary (#DCEBE4):** quiet sage surface for operational and people stories.
- **Neutral (#F6F8F7):** light page background.
- Semantic colors are reserved for meaning, not decoration.

## Typography

Use Plus Jakarta Sans for display and headings. Use DM Sans with Inter fallback for body and controls. Do not use one family for all hierarchy. Keep paragraphs readable, line-height generous, and avoid excessive uppercase copy.

## Layout

Use a centered max-width container, generous section rhythm, and an intentional mobile hierarchy. Verify 375, 390, 430, 768, 1024, and 1440px widths. Mobile navigation is an iOS-style sheet with a 44px close target. No unintended horizontal overflow.

## Elevation & Depth

Use soft shadows only (`rgba(20,32,43,0.04–0.12)`). Blur is reserved for sticky navigation and modal backdrop. Never use heavy black shadows or decorative glass on every card.

## Shapes

Major cards use 24px radius. Controls use 14px or 12px radius. Touch targets are at least 44px. Cards should carry one primary message and enough whitespace to preserve calm hierarchy.

## Components

The primary CTA is azure with white text. The secondary CTA is a quiet outlined control. Icons are Lucide line icons with consistent stroke weight. Form controls have visible focus rings, labels, pending/success/error states, and honest copy about persistence.

## Do's and Don'ts

- Do lead with Yumme's ability to build, operate, and grow F&B businesses.
- Do show Djiwa Tentram as both operating proof and a brand.
- Do describe website, application, POS, HR, dashboard, and digital-system work as official implementation services.
- Do use purposeful motion with `cubic-bezier(.32,.72,0,1)` and respect reduced motion.
- Do use real HTML/SVG for diagrams and accessible text for all important copy.
- Don't claim unverified revenue, client counts, outlet counts, or guaranteed growth.
- Don't use emoji as interface icons.
- Don't turn the page into a feature dump or a dashboard.
- Don't use unsupported stock imagery or generated artwork with malformed text.
