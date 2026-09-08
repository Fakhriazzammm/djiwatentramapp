---
version: alpha
name: 500 Kopi Tasik
description: Coffee passport Tasikmalaya dengan pengalaman collectible, editorial, dan mobile-first.
colors:
  primary: "#293E57"
  secondary: "#8A684A"
  tertiary: "#F3E2C6"
  neutral: "#FBF8F2"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.06em"
  body:
    fontFamily: DM Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 14px
  md: 20px
  lg: 27px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 14px
  reward-card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 16px
---

## Overview

500 Kopi Tasik terasa seperti passport perjalanan dan photo diary, bukan dashboard SaaS. Layout utama dipusatkan pada shell mobile 320–480px dengan gesture-friendly bottom sheets.

## Colors

Ink navy menjaga keterbacaan dan hubungan ekosistem Djiwa. Coffee brown dipakai sebagai aksen collectible; neutral warm menjadi paper-like canvas. Hindari coral, beach, dan yellow/orange fintech styling.

## Typography

Plus Jakarta Sans untuk headline dan label editorial; DM Sans untuk body copy. Jangan memakai label di bawah 11px. Semua action minimum 44px.

## Layout

Gunakan satu halaman dengan segmented tabs Gallery, Explore, dan Collection. Detail, auth, dan composer selalu sheet/overlay. Konten tidak melebar melebihi 480px pada desktop.

## Elevation & Depth

Gunakan shadow lembut dan satu lapis depth pada hero/reward card. Motion menggunakan easing iOS `cubic-bezier(.32,.72,0,1)` dan wajib menghormati prefers-reduced-motion.

## Shapes

Card radius 20–27px, control radius 14–16px, circular stamp sebagai motif collectible. Gunakan safe-area padding untuk CTA dan sheet.

## Components

Primary CTA adalah `Collect Stamp`. Reward card harus menjelaskan bahwa reward hanya untuk menu Djiwa Tentram. Live balance dan status wajib dirender sebagai HTML, bukan baked image text.

## Do's and Don'ts

- Do: gunakan foto kunjungan sebagai konten utama, state empty/loading/error yang jelas, dan auth gate tepat sebelum sticker.
- Do: reuse existing 3D asset hanya untuk supporting Djiwa Pay surfaces.
- Don't: membuat route terpisah untuk tab utama, mengarang jarak lokasi, atau menganggap redirect pembayaran sebagai settlement.
- Don't: menyimpan secret di frontend atau menampilkan reward sebagai saldo tunai bebas.
