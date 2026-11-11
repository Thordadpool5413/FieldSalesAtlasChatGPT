# Field Atlas: Ocean Drive design system

The working React app now uses a photographic South Beach dusk direction: Streamline Moderne architecture, coral and turquoise neon, silhouetted palms, a coral horizon, and midnight-blue work surfaces. The atmosphere belongs in the artwork; controls and business information remain readable HTML. This replaces the rejected standalone coastal concept. That earlier concept is not imported by the app.

## Reference research and its limits

The visual language draws on the established Miami Vice / South Beach vocabulary: tropical Art Deco, ocean light, pastel architecture, neon at dusk, and cinematic shadows. It avoids the generic glowing grids and all-over neon borders of a synthwave dashboard. The generated scene is an atmospheric architectural composite, not a photograph of a verified hotel, a current camera feed, or travel evidence. The Field Atlas wordmark is original; the television series logo and cast are not reproduced.

The environment denied HTTP access to these attempted reference sources:

- Art Deco Museum: https://www.artdecomuseum.org/
- Greater Miami tourism Art Deco reference: https://www.miamiandbeaches.com/things-to-do/art-deco
- Series background: https://en.wikipedia.org/wiki/Miami_Vice

Their pages were **not reviewed**, and no findings are attributed to their inaccessible content. The implementation also draws on a direct audit of the existing app, original generated desktop/mobile concepts, and real browser comparisons.

Successfully accessed sources:

- Fontsource Barlow Condensed and DM Sans packages, version 5.3.0. The SIL Open Font License notices ship in `public/resources/licenses/`.
- The app's existing Canadian boundary source, now bundled locally: https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/canada.geojson
- Its [source metadata](https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/canada.metadata.json) identifies “ArcGIS Canada Boundary.” The repository MIT notice and original metadata accompany the local file. This is a static geographic reference, not a routing or live conditions feed. The downloaded source SHA-256 is `06c4d3080b1d1279caaa4e87e734dff7e2f104006ba4ee94f8c6f85922c9ed58`.

## Production specification

- Desktop concept: [miami-vice-desktop-concept.webp](design/miami-vice-desktop-concept.webp), 1536 × 1024.
- Mobile concept: [miami-vice-mobile-concept.webp](design/miami-vice-mobile-concept.webp), 853 × 1844, representing a 390 × 844 CSS viewport.
- Main palette, derived from the supplied logo: background `#081226`, rail `#0a1529`, surface `#101f35`, white `#f4f5ff`, secondary text `#b2c5df`, electric cyan `#5ceaf5`, magenta `#ff5bc8`, warm yellow `#fff199`.
- Day palette: white surfaces, pale blue surroundings, midnight-blue text, deeper cyan `#087887`, magenta `#b42b7b` and gold `#805c08` for readable contrast.
- Display: Barlow Condensed 600/700. Interface: DM Sans 400/500/600/700, served from the app through Vite, with system fallbacks.
- Geometry: 220px desktop rail, 66px header, 28px content gutters, 12px main panel radius, 7px controls, hairline borders. Phone header 74px plus safe area; fixed five-tab navigation including Intelligence; touch controls generally 44px or larger.
- Icons: Lucide outline, restrained stroke weights, map / plane / people / calendar navigation. No decorative substitute icons for actual controls.
- Motion: brief control feedback, honoring reduced-motion settings. No ambient animation behind business data.
- Artwork: a separate 1800px WebP panorama (183 KB) and 900px phone version (56 KB). App text is not baked into images.

The exact supplied logo is served from `public/resources/field-sales-atlas-logo.jpg`; the original is preserved in `docs/export/brand-original.jpg`. Desktop navigation shows the full artwork. Phone navigation trims only the surrounding poster background while keeping the compass, both name lines and signature visible. Existing app icons already use this artwork. No replacement logo was generated. The PWA static-cache version advances to v14 so the updated appearance follows the existing reviewed-update flow.

The shared appearance owner is `src/styles/miami-vice-system.css`; `OceanMasthead.tsx` owns the photographic header. Five competing appearance imports were retired. Existing feature and PWA styles retain workflow geometry.

## Scope and behavior

Atlas, Travel, People and Calendar share the new chrome and palette. The travel desk shows the actionable itinerary and two-trainer week before the longer recommendation. Planning evidence and qualifications remain attached to the recommendation. The guided planner, advanced comparison, recovery review, travel assistant, forms, trainer settings, shared updates and workspace setup remain available.

The geographic canvas uses actual saved assignments, manager locations and airport references. Coaching and visit lenses use real saved records. It does not inherit the concept image's invented territory highlights. Canadian province geometry is local. The optional street-map provider and official travel feeds still have their existing network dependencies and limitations.

The PWA's static cache includes the new artwork and Canadian geographic reference. API responses and workspace credentials remain excluded. Update activation still requires the existing user review, protecting open forms.

## Concept comparison and intentional product differences

Browser/IAB tools were unavailable, so verification used Playwright and local Chromium. Original concept images and current browser screenshots were both opened with `view_image` for direct comparison. Desktop was checked at the concept's native 1536 × 1024 viewport; mobile was checked at its 390 × 844 CSS equivalent, plus narrow phone and tablet sizes.

| Comparison | Concept evidence | Implementation and decision |
| --- | --- | --- |
| Photography | Ocean Drive neon architecture at right, sunset and palms across the scene | Matching separately generated scene bundled locally, with a dark edge supporting live text. No external image dependency. |
| Palette | Deep petrol, white display text, turquoise action, coral accent | The current tokens use the supplied logo’s cyan, magenta, midnight blue and warm yellow; a readable day counterpart applies to the same workflows. |
| Typography | Condensed uppercase display; plain sans controls | Local Barlow Condensed and DM Sans replace remote font requests. The supplied image now replaces the previous text-only navigation wordmark. |
| Shell | 220px left rail, five primary destinations, quiet top header | Intelligence is visible alongside Atlas, Travel, People and Calendar. Existing record creation, trainer switch, appearance and settings are retained as functional product requirements. |
| Copy | “Your field. In perspective.” / “Plan a trip” / “Territory atlas” | Preserved. Phone subtitle follows the shorter mobile concept. No invented KPI, live weather or booking claims were added. |
| Map | Decorative selected Florida panel and example territory colors | Replaced by the actual geographic engine and actual saved data. No selection is fabricated; the initial inspector invites territory selection. State/province selection, layers and focus controls are retained. |
| Phone selection | Compact selected-territory region | Retains the app's richer territory inspector as a fixed, scrollable sheet above the tab bar. This preserves manager, airport and coverage workflows. Its stacking and close action were checked in the browser. |
| First-screen density | Concept omits onboarding and sample-data notices | Existing setup and clearly labeled demo notices remain. The phone introduction was shortened so the map still appears early. |
| Downstream work | Primary concept defines shared type, colors, controls and photographic language | Travel, manager profiles, calendar and guided forms use the same system. Bright legacy note boxes were corrected for dark mode. |

These product-specific differences preserve the real application rather than replacing it with a static image or fabricated dashboard. Temporary browser screenshots and test logs live outside the repository. The two concept references above are retained as design deliverables.

## Completed verification

- `npm run build`: frontend and server TypeScript checks and production Vite build passed.
- `npm test`: all 36 backend/data/optimizer checks passed.
- All 11 desktop browser cases passed in the full run. After fixing the short Safari viewport issue, all 11 mobile cases passed in the final mobile rerun. These exercise creation/persistence, shared updates, setup/demo separation, map selection, guided planning, availability conflicts, advanced comparison, joint approval, assistant evidence, disruption recovery and unavailable sources.
- Visual audit: Atlas, travel desk, guided planner, People and Calendar at 1440 × 1000 and 390 × 844; no page errors or horizontal page overflow. Additional Atlas checks at 320 × 740, 768 × 1024, 1440 × 1000 in day mode, and the native desktop concept size of 1536 × 1024 also found no horizontal overflow.
- Safari's 390 × 664 CSS viewport uses a compact photographic introduction; the fresh-workspace map starts at y=467, with a functioning territory sheet above the tab bar.
- Production offline check in an isolated workspace: photo and both fonts loaded, 12 rendered Canadian province outlines available for the Ontario view, no horizontal overflow, and no API responses or workspace URLs in the static cache. The offline notice still explicitly says shared and official data cannot refresh.
- `git diff --check` passed. No publication or environment-policy activation was performed.

The existing optional MapLibre and main JavaScript chunks still trigger Vite's large-chunk advisory. Vector mode continues to avoid loading MapLibre, and the redesign introduces no additional runtime UI library. Official weather/flight feeds and road-routing availability were not changed by this visual redesign.
