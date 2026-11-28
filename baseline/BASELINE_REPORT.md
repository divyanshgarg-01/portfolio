# Master baseline report — Next.js portfolio

Captured from the untouched committed Next.js application at HEAD `dbefe5d8eb59371552df708e17284542d2b81228`, build `tap3GZj3o4NlqNdMxNr8o`.

No static conversion was performed. No files in `main` or the original application source were changed. All artifacts in this directory belong to the isolated worktree on branch `gh-pages-baseline`.

## Capture matrix

| Baseline | CSS viewport | DPR | Screenshot pixels | Screenshots |
|---|---:|---:|---:|---:|
| Desktop | 1440×900 | 1 | 1440×900 | 33 |
| Tablet | 834×1112 | 2 | 1668×2224 | 34 |
| Mobile | 390×844 | 3 | 1170×2532 | 34 |
| Desktop reduced motion | 1440×900 | 1 | 1440×900 | 33 |

Total: **134 screenshots**, including **52 section-level captures** and interactive states for navigation hover, hero CTA hover, mobile menu, experience accordion, approach tabs, project filter/search, certification rail scroll, certificate link hover, skills rail, achievement lightbox, terminal, copy-email feedback, and floating CTA.

## Runtime results

- Console errors: **0** in every baseline.
- Page errors: **0** in every baseline.
- HTTP >=400 responses: **0** in every baseline.
- Only failed request: `mailto:divyanshgarg.contact@gmail.com` (`net::ERR_ABORTED`) from the intentional copy-email interaction.
- CV file: `GET /uploads/resume/Divyansh_Garg_CV.pdf` → `200 application/pdf`.
- First certificate file: `GET /api/certificates/bbc2496a-0a76-484c-b3d4-301ef6cb533f/file` → `200 application/pdf`.

## Baseline DOM/content checks

- Section order: `top`, `marquee`, `about`, `education`, `experience`, `approach`, `projects`, `certifications`, `skills`, `achievements`, `community`, `contact`.
- Hero tagline: `Driven by curiosity. Grounded in data. Inspired by technology.`
- Certificate cards: **8**; View Certificate links: **8**; Verify Credential links: **7**.
- Certification rail: `display:flex`, `overflow-x:auto`, `flex-wrap:nowrap`.
- Card width/gap: desktop `380px / 20px`, tablet `280px / 20px`, mobile `320px / 12px`.
- No horizontal page overflow at any viewport.
- Fonts loaded: Geist, Geist Mono, Fraunces, Instrument Serif, Playfair Display.
- Motion: active in normal baselines; inactive in reduced-motion baseline.

## Key computed tokens

| Token | Desktop | Tablet | Mobile |
|---|---:|---:|---:|
| Body text | `rgb(229,229,231)` | same | same |
| Body font | Geist 16px | same | same |
| H1 font size | 204.48px | 118.428px | 54.4px |
| H1 letter spacing | -9.2016px | -5.32926px | ~-2.448px |
| Hero subheadline | 36px / 43.92px | 24.8px / 30.256px | 22.23px |
| Certificate card background | `rgb(12,9,8)` | same | same |
| Certificate card border | `rgb(43,33,27)` | same | same |

## Reuse verification

Browser-side public components import only:

- React
- `lucide-react`
- `gsap` / `gsap/ScrollTrigger`
- `lenis`
- local `@/components/motion/*`, `@/components/public/*`, and `@/lib/types`

No `next/*`, Supabase, `node:`, service-role, or server-only imports exist in `components/public/**` or `components/motion/**`.

CSS/font reuse:

- Compiled CSS: `.next/static/css/74377c81e95dea99.css` (64,254 bytes, self-contained Tailwind output).
- Font faces: 8 total.
- Fraunces uses three generated woff2 files in `.next/static/media/` plus the `Fraunces Fallback` metric override.
- `next/font` injects `class="__variable_482ce5"` on `<html>`; compiled CSS defines `.__variable_482ce5 { --font-fraunces: "Fraunces", "Fraunces Fallback" }`.
- Static recreation must preserve that class/variable and the pre-paint `data-intro` / `data-hero-intent` script from `app/layout.tsx`.

Only source-level adaptation found in the public renderer is `process.env.NEXT_PUBLIC_SUPABASE_URL` in `components/public/PublicSite.tsx` (`mediaSrc`); a frozen static asset map can replace it without changing rendered output.

## Artifacts

- `baseline-manifest.json` — full machine-readable capture record.
- `capture_baseline.cjs` — reproducible capture script.
- `screenshots/` — all PNG captures.
