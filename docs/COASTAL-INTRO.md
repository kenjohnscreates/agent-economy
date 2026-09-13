# Botanica coastal intro

A short, skippable cloud reveal introduces the existing town. The approved coastal artwork and separately masked robot sit beneath three pixel cloud layers. The nearer banks travel faster, with square fragments clearing their edges. The existing Wordmark component supplies the brand identity.

## Review paths

- `/`: first visit in a tab shows the intro.
- `/?intro=force`: replay the intro even after a previous visit.
- `/?intro=skip`: enter immediately.
- `/map-demo?intro=force`: the same entry over the existing fixture replay, without an API.
- `/intro-demo`: independent nine-second cinematic preview with Replay, Pause, seeking and Export video.
- `/intro-demo?still=2400`: inspect a particular millisecond. Values clamp to 0 through 9000.
- `/intro-demo?still=9000&capture=1`: final artwork without preview controls.

The coastal composition was approved separately from the original town-only proposal. The movie ends on the coast and robot. The application entry continues into the existing town.

## Loading and accessibility

Normal entry takes about 2.5 seconds after the intro assets and fonts decode. It only hands off after TownMap initializes its Pixi canvas. A small context notification follows the existing `data-ready` assignment; MapSlotProps, ZONES and zonePoint are unchanged.

The app initializes behind an inert content wrapper. Skip remains keyboard accessible and immediately releases that wrapper. The intro does not autofocus. If its focused Skip control is removed, focus returns to the content wrapper without scrolling. Map initialization errors expose the existing error message. A 12-second safety timeout also removes the decorative overlay, including when an artwork request never finishes. This timeout does not claim the map is ready.

Session storage records dismissal per tab. Denied storage falls back to memory for the current document. Persistence across a full reload is unavailable when the browser denies storage. A small server-rendered head script prevents repeat-visit cloud flashes and releases the inert attribute on skipped visits before delayed hydration. Explicit force/skip links take precedence.

Reduced motion displays the composed still with no clouds moving or robot bobbing, and enters the town as soon as assets and map are ready. The CSS media query also suppresses motion before hydration. Effects cancel animation frames, listeners, observers and timers on unmount.

## Video export

Open `/intro-demo`, select **Export video**, keep the tab in the foreground for nine seconds, then select **Download video**. The encoder uses a fixed 1920x1080 canvas at 30fps, the same cloud renderer, timeline, artwork and font families. This explicit export records cinematic motion even if the device prefers reduced motion; the webpage itself continues to respect that preference.

Browsers with H.264 MediaRecorder support produce MP4. Others fall back to WebM. Unsupported encoders show an error. Recording is cancelled when the page unmounts or after 15 seconds if background throttling prevents completion. The encoder module is dynamically loaded only by the preview's Export action.

For broad sharing compatibility, normalize a downloaded file with:

```sh
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an botanica-cloud-reveal.mp4
```

Rendered video is a review artifact, not a repository asset. The committed artwork is a lossless WebP landscape and a PNG robot cutout with real alpha transparency, approximately 1.5 MB combined. The robot RGB pixels retain the approved scene artwork. No animation dependency or backend changes were added.

## Validation

Run the existing web typecheck, lint, test and build commands. `lib/intro.test.ts` covers overrides, readiness gating, reduced motion and bounded movie seeking. Browser acceptance covers keyboard Skip and map selection, once-per-tab behavior, force/skip, artwork failures and timeout, actual delayed/failed map atlas loading, navigation cancellation, reduced-motion media emulation and layouts at 390x844, 1440x900 and 1920x1080.

Live API behavior is preserved; when no API is running, the existing connection error and Switch to replay control remain available. No real-chain transactions are needed to review the intro. Review `/map-demo?intro=force` for a deterministic town playback.
