---
name: Clinical Precision
colors:
  surface: '#f6fafe'
  surface-dim: '#d6dade'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f8'
  surface-container: '#eaeef2'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#171c1f'
  on-surface-variant: '#3d4946'
  inverse-surface: '#2c3134'
  inverse-on-surface: '#edf1f5'
  outline: '#6d7a77'
  outline-variant: '#bcc9c5'
  surface-tint: '#006b5f'
  primary: '#00685d'
  on-primary: '#ffffff'
  primary-container: '#008376'
  on-primary-container: '#f4fffb'
  inverse-primary: '#70d8c8'
  secondary: '#705d00'
  on-secondary: '#ffffff'
  secondary-container: '#fcd400'
  on-secondary-container: '#6e5c00'
  tertiary: '#545c72'
  on-tertiary: '#ffffff'
  tertiary-container: '#6c748b'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#8df5e4'
  primary-fixed-dim: '#70d8c8'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005048'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f6fafe'
  on-background: '#171c1f'
  surface-variant: '#dfe3e7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
  gutter: 1.5rem
  margin: 2rem
---

## Brand & Style

This design system is engineered for medical diagnostic environments where clarity, speed of cognition, and a sense of sterile reliability are paramount. The brand personality is authoritative yet approachable, evoking the feeling of a modern, high-tech laboratory.

The aesthetic follows a **Corporate / Modern** style with a focus on high-contrast "Medical Minimalism." By utilizing a "Teal Clinical" palette against vast white space, the UI prioritizes data density without sacrificing legibility. Every element is designed to feel precise, deliberate, and trustworthy, ensuring that diagnostic information remains the focal point.

## Colors

The palette is anchored by **Clinical Teal**, used for navigation, structural bounding boxes, and active states. This color provides a calming yet professional anchor for the medical context.

- **Primary (Clinical Teal):** #00897B. Used for core branding, primary navigation icons, and key interactive borders.
- **Action (Premium Gold):** #FFD700. Reserved exclusively for high-priority actions like "Download PNG" or "Finalize Report" to ensure they stand out against the teal and white environment.
- **Surface (Mint-Grey):** #F1F5F9. Used for background layering and subtle grouping containers to prevent visual fatigue from pure white.
- **Status (Semantic):** Success is represented by a slightly brighter green, while warnings utilize a soft amber. 
- **Typography:** The primary text color is a deep Slate (#0F172A) to ensure WCAG AAA contrast ratios on white surfaces.

## Typography

This design system utilizes **Inter** for all UI elements to capitalize on its exceptional legibility and tall x-height, which is critical for reading dense medical data and numerical values.

Hierarchy is established through weight rather than dramatic size shifts. Use `label-md` for metadata and technical identifiers, ensuring they are uppercase with increased tracking for rapid scanning. For tabular data or diagnostic readouts, a monospaced font (JetBrains Mono) may be used as a secondary support for numerical alignment.

## Layout & Spacing

The layout employs a **12-column Fixed Grid** for desktop views (max-width 1440px) to maintain predictable line lengths for medical reports. On mobile, the system transitions to a fluid single-column layout with 16px horizontal margins.

Spacing follows a strict 4px baseline grid. Internal component padding should default to `md` (16px), while grouping of related diagnostic panels should use `lg` (24px) to ensure clear separation. Use `xl` (40px) for section headers to provide necessary "breathing room" in a data-heavy environment.

## Elevation & Depth

To maintain the "sterile" feel, this design system avoids heavy shadows. Depth is communicated through **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Background):** The base layer uses #F1F5F9.
- **Level 1 (Cards/Panels):** Pure white (#FFFFFF) surfaces with a 1px solid border in #E2E8F0. No shadow is applied here.
- **Level 2 (Dropdowns/Modals):** Pure white surfaces with a subtle, tight shadow (0px 4px 12px rgba(0, 0, 0, 0.05)) to indicate temporary interaction.
- **Active State:** Elements being interacted with should use a 2px stroke of the primary Clinical Teal rather than an elevation change.

## Shapes

The design system utilizes **Rounded** corners to soften the clinical environment and make the software feel modern and user-friendly.

- **Standard Elements:** 8px (0.5rem) radius for buttons, input fields, and cards.
- **Large Containers:** 16px (1rem) for main dashboard panels.
- **Small Elements:** 4px (0.25rem) for checkboxes and tags.

## Components

- **Buttons:** 
  - *Primary Action:* Solid Gold (#FFD700) with Slate text. Bold and high-contrast.
  - *Secondary Action:* Solid Teal (#00897B) with White text.
  - *Ghost:* Teal border (1px) with Teal text for less critical actions.
- **Input Fields:** White background, 1px grey border, 8px corner radius. On focus, the border thickens to 2px Teal. Labels are always positioned above the field for clarity.
- **Diagnostic Cards:** White background, 8px radius, subtle grey border. Headers within cards should have a light Teal bottom border (2px) to denote the start of data.
- **Status Chips:** Use high-saturation background tints with dark text (e.g., Light Green background for "Normal", Light Red for "Critical").
- **Data Tables:** Alternate row striping using the mint-grey (#F1F5F9) background. Remove vertical lines; use only horizontal 1px dividers to maintain a clean horizontal flow for reading results.