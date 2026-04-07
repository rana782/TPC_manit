# Application Flow UI Redesign

## Overview
This document details the UI and UX improvements made in **Module 7: Application Flow** for the College Placement Portal.

The goal of this redesign was to transform the original single-page, vertically-scrolling application form inside `JobBoard.tsx` into an guided, intuitive, multi-step wizard. This mirrors premium Applicant Tracking Systems (ATS) and modern SaaS interfaces.

---

## 🏗️ Architectural Changes

### 1. The Stepper Wizard
We implemented a dynamic 4-step wizard using React state (`currentStep`) and `framer-motion` for smooth transition animations between steps.

*   **Step 1: Resume Selection**
    *   Displays all uploaded resumes from the student's profile.
    *   Includes an "Analyzig" loader when checking the ATS score for the first time.
    *   Visually highlights the selected resume card with the primary brand color ring.
*   **Step 2: ATS Match Insights**
    *   Once a resume is selected, the applicant can click "Next" to view detailed ATS feedback.
    *   Features a **Visual Score Meter** animating fluidly from 0 to the calculated score.
    *   Utilizes a dynamic color indicator script (Emerald for `> 70`, Amber for `40-70`, Red for `< 40`) to instantly communicate match strength.
    *   Displays matched keywords as rounded badge tags.
*   **Step 3: Employer Questions** (Conditionally Rendered)
    *   If the job requires custom essay inputs or portfolio URLs, this step is dynamically added to the stepper header.
    *   Features clean, modern input fields with deep focus states.
*   **Step 4: Review & Submit**
    *   A final confirmation screen summarizing the chosen resume and the predicted ATS match before the applicant commits to applying.

### 2. State Management Updates
- Added `currentStep` to manage the currently visible wizard panel.
- Modified `handleApplyClick` to reset `currentStep` to `1` every time a new job's apply modal is opened.
- Implemented `handleNextStep` and `handlePrevStep` functions to facilitate wizard navigation and handle step-specific form validation (e.g., preventing a user from moving to Step 2 without selecting a resume).

### 3. Visual Components
- **Stepper Header**: Built a responsive, horizontal stepper graphic at the top of the right modal panel mapping the progression. Completed steps turn Emerald with a checkmark, the active step pulses in Primary Blue, and future steps remain greyed out.
- **Animations**: Replaced abrupt DOM changes with `<AnimatePresence mode="wait">` to cleanly fade-slide the old step out and the new step in.

---

## 🎨 Design System Compliance
The new application flow strictly adheres to the portal's design system:
- **Typography:** Uses Inter with heavy emphasis on `font-bold` and `font-extrabold` for headings and data points.
- **Color Palette:** Primary Blue (`#2563EB`) guides the core interactions, while the semantic palette (Emerald/Amber/Red) anchors the ATS scoring feedback.
- **Micro-interactions:** Buttons now possess active scale transforms (`active:scale-[0.98]`) and hover shadows (`hover:shadow-primary-500/25`).

---

## 📸 Visual Verification

Screenshots of the complete multi-step flow have been generated via Playwright regression testing and are saved in the `ui-verification/application-flow` directory:

1.  **Resume Step**: Shows list selection UI.
2.  **ATS Score Step**: Showcases the radial/bar visual meter and color mapping.
3.  **Question Step**: Validates responsive textarea fields for custom employer questions.
4.  **Review Step**: Final confirmation UI.

## File Modifications
- **Modified:** `src/pages/JobBoard.tsx` (Complete rewrite of the Apply Modal section).
- **Added:** `ui-tests/screenshot-application-flow.spec.ts` (Playwright E2E automation for step capture).
