# Module 1: Global Layout System — Implementation

## Module Name
Global Layout System + Branding (TPC Portal MANIT)

## Current UI Problems
1. **No layout shell** — all pages were standalone with inline styles, no shared structure
2. **No sidebar navigation** — Dashboard had raw buttons for page navigation
3. **No top navbar** — no search, notifications, or profile dropdown
4. **No responsive design** — pages broke on mobile/tablet
5. **Branding was "PlaceHub"** — needed to be "TPC Portal" with MANIT college logo
6. **No page headers** — no breadcrumbs or consistent title areas
7. **No loading state** — no spinner while auth context initializes
8. **No route protection** — Dashboard manually checked auth instead of layout-level guard

## New Layout Design
```
Desktop (≥1024px):
┌──────────┬─────────────────────────────────────┐
│ Sidebar  │  Navbar (search + bell + avatar)     │
│ (260px)  ├─────────────────────────────────────┤
│ MANIT    │  PageHeader (breadcrumb + title)     │
│ logo +   ├─────────────────────────────────────┤
│ nav      │  Content (scrollable)                │
│ items    │                                      │
└──────────┴─────────────────────────────────────┘

Collapsed (72px icons-only sidebar)
Mobile (<1024px): Hamburger → overlay drawer
```

## Component Hierarchy
```
src/components/layout/
├── AppLayout.tsx         — Main shell: sidebar + navbar + <Outlet/>
├── Sidebar.tsx           — 260px collapsible, role-based nav, animated
├── Navbar.tsx            — Search bar, notification bell, profile dropdown
├── PageHeader.tsx        — Title + subtitle + breadcrumbs + action slot
└── ContentContainer.tsx  — Padded scrollable content wrapper
```

## Design Improvements
| Area | Before | After |
|------|--------|-------|
| Layout | No structure | Full-screen sidebar + navbar + content |
| Navigation | Buttons in Dashboard | Persistent sidebar with role-based items |
| Sidebar | None | 260px, collapsible to 72px, smooth animation |
| Mobile | Broken | Overlay drawer with backdrop |
| Navbar | None | Search, notification bell (badge), profile avatar + dropdown |
| Branding | "PlaceHub" + GraduationCap icon | "TPC Portal" + MANIT college logo |
| Page title | None | PageHeader with breadcrumbs |
| Route protection | Per-page check | Layout-level redirect |
| Dashboard | Inline-style buttons | Stats cards + account details card |
| Loading | None | Centered spinner while auth loads |

## Files Modified
| File | Action |
|------|--------|
| `src/assets/manit-logo.png` | **New** — MANIT college logo |
| `src/components/layout/AppLayout.tsx` | **New** — main layout shell with Outlet |
| `src/components/layout/Sidebar.tsx` | **New** — collapsible sidebar, role-based nav |
| `src/components/layout/Navbar.tsx` | **New** — top navbar with search, bell, avatar |
| `src/components/layout/PageHeader.tsx` | **New** — page title + breadcrumbs |
| `src/components/layout/ContentContainer.tsx` | **New** — padded content wrapper |
| `src/components/ui/AuthLayout.tsx` | **Modified** — TPC Portal branding + MANIT logo |
| `src/App.tsx` | **Modified** — nested routes under AppLayout |
| `index.html` | **Modified** — title → "TPC Portal - MANIT Bhopal" |
| `src/pages/Dashboard.tsx` | **Modified** — stats cards + PageHeader, removed inline nav |

## UI Enhancements
- **MANIT logo** displayed in sidebar header and auth pages
- **TPC Portal** branding throughout (replaced PlaceHub)
- **Collapsible sidebar** — 260px → 72px with smooth Framer Motion animation
- **Role-based navigation** — Student sees Profile/Resumes/Job Board; SPOC sees Manage Jobs/Analytics; Coordinator sees Admin Panel/Analytics
- **Active route highlighting** — blue background + text on current nav item
- **Notification bell** with red badge dot
- **Profile avatar** with initials, dropdown showing email/role + View Profile + Sign out
- **Mobile drawer** — hamburger opens sidebar as overlay with dark backdrop
- **Dashboard redesign** — 4 stat cards (Applications, Active Jobs, Interviews, Offers) + Account Details card
- **Breadcrumb navigation** in PageHeader component
- **Loading spinner** during auth context initialization
- **Layout-level auth guard** — redirects to /login if not authenticated

## Screenshots
All saved in `ui-verification/layout-module/`:
- `dashboard-desktop.png` — Full sidebar + navbar + dashboard content
- `dashboard-collapsed.png` — Collapsed 72px sidebar (icons only)
- `dashboard-mobile.png` — Mobile layout with hamburger menu
- `dashboard-mobile-sidebar.png` — Mobile sidebar drawer open
- `login-tpc-branding.png` — Login page with TPC Portal + MANIT logo
