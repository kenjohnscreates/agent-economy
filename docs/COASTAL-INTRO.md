# Botanica coastal intro

The active intro uses Dan's selected `Use_this_frame_as_the_ending_f.mp4` directly. It replaces the earlier generated cloud animation. The video is H.264, 1280x720, about ten seconds, with its original audio track retained. The webpage plays it muted and inline. It is remuxed for fast-start without re-encoding its picture or audio.

## Review

- `/?intro=force` or `/map-demo?intro=force`: play the full clip, then enter the existing town after its canvas is ready.
- `?intro=skip`: enter immediately.
- Normal entry: once per tab, using session storage with a current-document memory fallback when storage is denied.
- `/intro-demo`: preview with native playback/seek controls, Replay, and a direct Download video link.

The viewport contains the entire 16:9 frame. Narrow phones use a pale background around the video rather than cropping out the robot or lighthouse. The video already contains the chosen visual composition; no generated lettering or extra robot is overlaid.

Reduced motion displays `public/intro/ending.webp`, extracted from the supplied clip near its ending, and does not mount or download a video element. Changing the motion preference during playback pauses and unmounts the video. No motion starts before the preference is known.

The application initializes behind an inert wrapper. Skip is keyboard accessible and immediately removes the video. The intro never autofocuses; removing a focused Skip control restores focus to the content wrapper without scrolling. Video failure, map initialization failure, or a 20-second safety timeout reveals the application and its existing status. Timeout does not claim readiness. Otherwise, both the real video `ended` event and TownMap readiness are required before automatic dismissal.

The map readiness context remains frontend-local. MapSlotProps, ZONES, zonePoint, live/replay semantics, visitor rules, API and wallet behavior are unchanged. Muted autoplay rejection presents a Play intro button while Skip remains available.

## Validation

Web typecheck, lint, unit tests and production build pass. The replacement-specific browser checks cover full playback and ready-map handoff, keyboard Skip, session suppression, reduced-motion media emulation, failed media, phone framing and Replay. Prior generated-animation acceptance reports are historical and do not describe this replacement.

The source video is now a required runtime asset committed at `apps/web/public/intro/reveal.mp4`. Downloading it preserves its audio track; the loading screen stays silent. The old generated renderer remains in source history and is not imported by the active intro or preview.
