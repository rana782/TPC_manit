# Module 4: Profile Builder — Implementation

## Module Name
Student Profile Builder Redesign

## Current UI Problems
1. All inline styles (`style={{}}`) — no Tailwind
2. Basic tab bar with no visual hierarchy
3. No progress indicator or profile completion tracking
4. No stepper navigation between sections
5. Raw `<input>` fields with no styling
6. No animated transitions between tabs
7. Internship/certification forms not visually separated
8. Document upload cards have no upload status indicators

## New Layout Design
```
┌─ Profile Completion: 100% ████████████████████ ─┐
│                                                   │
│  ① Personal  ──── ✓ Academic ──── ✓ Links ──── ④ │
│                                                   │
│  ┌─ Documents & Photo ─────────────────────────┐ │
│  │  [Photo]  Profile Photo                      │ │
│  │           JPG, PNG or WebP. Max 2MB.         │ │
│  │           [Upload Photo]                     │ │
│  ├──────────────────────────────────────────────┤ │
│  │  COLLEGE ID  ✓ Uploaded  │  AADHAAR ✓       │ │
│  │  PAN  [Upload]           │  OTHER [Upload]  │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  [← Previous]                        [✓ Finish]  │
└───────────────────────────────────────────────────┘
```

## Component Hierarchy
```
Profile.tsx
├── PageHeader (breadcrumbs: Dashboard > Profile)
├── Profile Locked Banner (conditional)
├── Progress Bar (animated, color-coded)
├── Stepper (4 steps with checkmarks)
├── Step Content (animated transitions)
│   ├── Step 0: Personal (name, branch, phone, DOB, address)
│   ├── Step 1: Academic (10th, 12th, CGPA, semester, backlogs)
│   ├── Step 2: Links & Experience (social links + internships + certifications)
│   └── Step 3: Documents (photo upload + legal document cards)
└── Navigation (Previous / Save & Next / Finish)
```

## Design Improvements
| Area | Before | After |
|------|--------|-------|
| Navigation | 6 plain tabs | 4-step horizontal stepper with icons + checkmarks |
| Progress | None | Animated bar (red < 40%, amber < 70%, green ≥ 80%) |
| Inputs | Inline-styled `<input>` | Tailwind styled with focus rings, hover states |
| Step transitions | Tab switch (instant) | Framer Motion slide animation |
| Internships | Plain bordered cards | Hover-interactive cards with trash icon |
| Add forms | Inline fields | Dashed-border add forms (visually distinct) |
| Documents | Basic file inputs | Card grid with upload status (green = uploaded) |
| Photo | Plain file input | Avatar preview + styled upload button |
| Save | Single button at bottom | "Save & Next" per step + "Finish" on last step |
| Feedback | Top-level text messages | Animated toast banners (auto-dismiss 3s) |
| Locked state | Inline red box | Styled alert banner with Lock icon |

## Files Modified
| File | Action |
|------|--------|
| `src/pages/Profile.tsx` | **Full rewrite** — 500-line stepper-based profile builder |

## UI Enhancements
- **4-step horizontal stepper** with icons (User, GraduationCap, Link2, FileUp)
- **Checkmark indicators** on completed steps (green circles)
- **Active step highlight** (blue circle with shadow)
- **Connector lines** between steps (green when step complete)
- **Animated progress bar** — color transitions based on completion %
- **FormField component** — reusable styled input with label, focus ring, hover
- **Animated step transitions** — slide left/right via Framer Motion
- **"Save & Next" button** auto-saves before advancing
- **Dashed-border add forms** for internships and certifications
- **Trash icon** on existing items with red hover state
- **Document upload cards** — green border + checkmark when uploaded
- **Profile photo section** — avatar preview + camera placeholder + upload button
- **Auto-dismissing toasts** (3-second timeout)
- **Breadcrumb navigation** (Dashboard > Profile)
- **Mobile responsive** — single-column form, stepper icons only (labels hidden)

## Screenshots
Saved in `ui-verification/profile-module/`:
- `profile-step1-personal.png` — Personal form with stepper + progress bar
- `profile-step2-academic.png` — Academic fields
- `profile-step3-links.png` — Links, internships, certifications
- `profile-step4-documents.png` — Photo upload + legal document cards
- `profile-mobile.png` — Mobile responsive layout
