import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const globalsCss = fs.readFileSync(path.resolve("src/app/globals.css"), "utf8");
const appShellCode = fs.readFileSync(path.resolve("src/components/app-shell.tsx"), "utf8");
const flashcardSessionCode = fs.readFileSync(path.resolve("src/components/flashcard-session.tsx"), "utf8");
const flashcardExperienceCode = fs.readFileSync(path.resolve("src/components/flashcard-experience.tsx"), "utf8");
const practiceCode = fs.readFileSync(path.resolve("src/components/practice.tsx"), "utf8");

test("Accessibility tokens: high-contrast focus indicator and reduced motion in globals.css", () => {
  // Focus outline must not use faint semi-transparent alpha (#71866a77)
  assert.ok(!globalsCss.includes("#71866a77"), "globals.css should not use faint focus outline");
  assert.ok(globalsCss.includes(":focus-visible{outline:3px solid var(--ink)"), "globals.css must have high-contrast focus outline");
  
  // Must respect prefers-reduced-motion
  assert.ok(globalsCss.includes("@media(prefers-reduced-motion:reduce)"), "globals.css must include reduced-motion rules");
});

test("Progress bar: visual fill and accessibility contract", () => {
  // globals.css must define visual fill for child i / elements
  assert.ok(globalsCss.includes(".progress i"), "globals.css must style .progress i");
  assert.ok(globalsCss.includes("background:var(--green)"), "progress bar must have green fill");

  // Flashcard components must expose role=progressbar with required ARIA attributes
  for (const code of [flashcardSessionCode, flashcardExperienceCode]) {
    assert.ok(code.includes('role="progressbar"'), "Flashcard progress must have role=progressbar");
    assert.ok(code.includes("aria-valuenow="), "Flashcard progress must specify aria-valuenow");
    assert.ok(code.includes('aria-valuemin={0}'), "Flashcard progress must specify aria-valuemin");
    assert.ok(code.includes('aria-valuemax={100}'), "Flashcard progress must specify aria-valuemax");
    assert.ok(code.includes("aria-label="), "Flashcard progress must specify aria-label");
  }
});

test("Touch target contract: controls adhere to WCAG 44x44px standard", () => {
  assert.ok(globalsCss.includes("a.tag,button.tag{min-height:44px;min-width:44px"), "interactive tags must have min 44x44px target");
  assert.ok(globalsCss.includes("a.muted{min-height:44px"), "back links (a.muted) must have 44px min-height target");
  assert.ok(globalsCss.includes(".bottom-nav a{min-height:44px;min-width:44px"), "bottom nav items must have 44x44px target");
  assert.ok(globalsCss.includes(".btn{min-height:44px;min-width:44px"), "action buttons must have 44x44px target");
});

test("AppShell: skip link and full mobile bottom navigation", () => {
  // Skip link must exist, point to #main-content, and main must have id and tabIndex
  assert.ok(appShellCode.includes('href="#main-content"'), "AppShell must provide a skip link to #main-content");
  assert.ok(appShellCode.includes('className="skip-link"'), "Skip link must have skip-link class");
  assert.ok(appShellCode.includes('id="main-content"'), "Main element must have id=main-content");
  assert.ok(appShellCode.includes("tabIndex={-1}"), "Main element must have tabIndex=-1 for program focus");

  // Mobile bottom nav must not truncate Settings (should map full navItems)
  assert.ok(!appShellCode.includes("navItems.slice(0, 5)"), "Bottom nav must not truncate navItems");
  assert.ok(appShellCode.includes('aria-current='), "Navigation links must support aria-current");
  assert.ok(globalsCss.includes(".bottom-nav a.active"), "globals.css must have active styling for bottom nav");
});

test("Practice & interactive games: selection state announcement via aria-pressed and labels", () => {
  assert.ok(practiceCode.includes("aria-pressed="), "Choice buttons must declare aria-pressed state");
  assert.ok(practiceCode.includes('role="status"'), "Feedback results must have role=status");
  assert.ok(practiceCode.includes('aria-live="polite"'), "Feedback results must declare aria-live");
});
