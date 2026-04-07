# Module 2: Authentication UI — Implementation

## Module Name
Authentication UI Redesign (Login, Signup, OTP, Forgot Password)

## Current UI Problems
1. **Split-screen layout** — previous design used a left brand panel + right form, which was too heavy for auth pages
2. **Logo not displaying** — downloaded PNG was actually an HTML error page (broken file)
3. **No centered card** — form was just on a white background, not a proper floating card

## New Layout Design
**Centered auth card on gradient background** (Stripe/Notion/Linear style):
- Full-screen gradient background (`primary-600 → primary-700 → secondary-600`)
- Decorative translucent circles for depth
- White card: `rounded-xl`, `shadow-lg`, `p-8 sm:p-10`, max-width 440px
- MANIT SVG logo + "TPC Portal" + "MANIT Bhopal" centered at top of card
- Responsive: card fills width on mobile with padding

## Component Hierarchy
```
AuthLayout.tsx (centered card on gradient)
├── MANIT logo (SVG)
├── Brand text ("TPC Portal" / "MANIT Bhopal")
├── Title + subtitle
└── {children} (form content from each page)
```

## Design Improvements
| Area | Before | After |
|------|--------|-------|
| Layout | Split-screen (45% + 55%) | Centered floating card on gradient |
| Logo | Broken PNG (HTML error page) | Working SVG logo |
| Card style | No card, plain white bg | `rounded-xl shadow-lg` white card |
| Background | None / white | Blue→purple gradient with decorative circles |
| Branding | "TPC Portal" (logo broken) | MANIT SVG logo + "TPC Portal" + "MANIT Bhopal" |
| Animation | Form slide-in | Card scale + fade-in |

## Files Modified
| File | Action |
|------|--------|
| `src/assets/manit-logo.svg` | **New** — SVG version of MANIT logo (replaces broken PNG) |
| `src/assets/manit-logo.png` | **Deleted** — was an HTML error page, not a valid PNG |
| `src/components/ui/AuthLayout.tsx` | **Redesigned** — centered card on gradient background |
| `src/components/layout/Sidebar.tsx` | **Fixed** — import changed from .png to .svg |

## UI Enhancements
- **MANIT SVG logo** renders correctly in sidebar and auth pages
- **Centered card** with `rounded-xl shadow-lg` floating on gradient background
- **"MANIT Bhopal"** subtitle under "TPC Portal" brand name
- **Gradient background** with decorative translucent circles for depth
- **Smooth card animation** — scale + fade-in via Framer Motion
- All existing features preserved: password toggle, loading buttons, error alerts, form validation, OTP input, Google Sign-in

## Screenshots
All saved in `ui-verification/auth-module-v2/`:
- `login-desktop.png` — Centered login card on gradient
- `login-mobile.png` — Mobile responsive login
- `register-desktop.png` — Register card with form fields
- `register-mobile.png` — Mobile responsive register
- `forgot-password-desktop.png` — Password reset card
- `forgot-password-mobile.png` — Mobile responsive forgot password
- `sidebar-logo-desktop.png` — Sidebar showing MANIT logo correctly
