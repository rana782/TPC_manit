# Module Name: Job Feed

## Current UI Problems
- Single linear layout not utilizing horizontal widescreen space.
- Filters were simple inline inputs instead of a dedicated, always-visible sidebar.
- Job cards were basic and lacked visual hierarchy.
- "Apply Modal" was simple, lacking detailed contextual information about the job.
- Insufficient visual emphasis on ATS match scores and application history.

## New Layout Design
- **Desktop Strategy:** Replaced linear layout with a modern 2-column SaaS dashboard structure.
- **Sidebar (Left):** 260px fixed-width column containing Tab Navigation and Job Filters. Sticky positioned for ease of access during scrolling.
- **Main Feed (Center):** Full width remaining space dedicated to job cards or application history with a centered, balanced max-width approach.
- **Job Details Modal:** Transformed from a small modal into a highly immersive split-screen layout displaying full job description/requirements on the left and the application form (ATS Scores, Resume select, Custom questions) on the right.

## Component Hierarchy
- `JobBoard` (Main Container)
  - Layout Grid (`flex flex-col lg:flex-row`)
    - Left Sidebar Column (`w-[260px]`)
      - Tab Switcher (`Available Jobs` / `My Applications`)
      - Job Filters (`Search`, `Branch Select`, `Min CTC`)
    - Main Content Column (`flex-1`)
      - Recommended Roles / Job Cards (List)
        - `<Job Card Item>`
          - Company Logo, Title, CTC, Job Type, Deadline, Skills/Branch Tags
          - Apply / View Details Button
      - Application History Cards (List)
        - Process Timeline
        - ATS Match Score Progress Bar
  - `JobDetailsModal` (`AnimatePresence` Modal)
    - Left Detail Panel (About Role, Requirements, Eligibility)
    - Right Action Panel (Select Resume, ATS Insights, Employer Questions, Quick Apply)

## Design Improvements
- Upgraded the aesthetic with modern **TailwindCSS** utility classes focusing on border-radius (`rounded-xl`/`2xl`), subtle shadows (`shadow-sm`, `hover:shadow-lg`), and gradient accents.
- Used **Lucide Icons** extensively to bring visual context to text (e.g. `Zap` for apply, `Building2` for company).
- Incorporated **Framer Motion** for smooth stagger animations as job cards load, and for page transitions when opening the Job Details Modal.

## Files Modified
1. `frontend/src/pages/JobBoard.tsx` (Complete rewrite)

## UI Enhancements
- **Dynamic Skill Tags:** Branch and profile field tags automatically truncate with `+X more` labels.
- **ATS Match Score Highlighting:** Application history now features visual progress bars denoting ATS scores with color scaling (Emerald for High, Amber for Med, Red for Low) along with keyword matching highlights.
- **Application Journey Timeline:** Displays the timeline of an application directly inside the history cards natively instead of just simple text.
- **Responsive Mastery:** Flawlessly transitions from the desktop fixed sidebar to a mobile-friendly stacked layout on smaller viewports.
