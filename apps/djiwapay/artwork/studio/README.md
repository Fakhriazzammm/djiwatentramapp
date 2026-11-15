# Djiwa Pay — Studio objects

## Visual direction
Use `style-reference.png` as the authoritative style reference supplied by the user. These are physically believable miniature objects rendered in a warm studio: enamel, brushed brass, dark metal, rubber, paper, wood and leather. Preserve actual material texture, modest bevels and readable construction. Use pencil yellow, vermilion, olive, charcoal and ivory according to the object. The mascot is a satin yellow enamel coin with brushed brass rim and charcoal rubber limbs.

Avoid pastel candy palettes, lilac, pink, mint, decorative flowers, ribbons, extra sparkles, exaggerated inflated shapes, blush and faces on everyday objects. The mascot alone has a simple face.

## Generate again
OpenAI's built-in ImageGen generated this set; the tool does not expose a selectable underlying model version.

1. Read `prompts.json`.
2. Attach `style-reference.png` as a style reference, not an edit target.
3. For each icon use `base + subjects[iconName]`. For the mascot use `base + mascot`.
4. Set `transparent_background: true`. Generate each asset separately.
5. Keep the PNG master in this directory, and optimize a 256px WebP (mascot 512px) into `../../public/assets/djiwapay-studio/` with preserved alpha.
6. When generating another mascot pose, also attach `mascot.png` as an identity reference. Preserve circular brass rim, yellow enamel, charcoal limbs, small inset eyes and simple smile. Change only the pose/expression.

The source reference uses a beige studio backdrop; runtime assets deliberately use transparent backgrounds so they fit the app's surfaces.

## App integration
`payAsset`, `Ic`, `I3`, and `Mascot` in `src/features/shell/dpx-ui.tsx` use the app-only studio catalog. The initial loader uses the same mascot. Sign-in, onboarding and the voice assistant also use it. All 66 icon subjects include navigation, categories, services, payment actions, status, compact controls and empty states.

Google's authentication mark, user receipt photos, data charts and scannable payment QR payloads retain their functional content.

Older generated concepts are preserved under `../archive/` and are not served as runtime assets.
