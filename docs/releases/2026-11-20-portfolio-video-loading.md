# Selected-video buffering feedback

A slow first frame previously left the selected upload blank despite the player having started its play request. This scoped change reuses the existing three pink dots after 200 ms of actual playback waiting. First-frame/playing/pause/error events clear them; autoplay rejection returns to the existing Play control. Reduced-motion visitors retain explicit playback. Closing removes the pending indicator with the selected video. Only the video area is affected; controls stay available.

Ten focused viewer/loading cases, TypeScript and scoped lint passed. Runner browser acceptance must verify delayed media in light/night, recovery to actual decoded playback and closing while pending. The local test harness loads the existing shared indicator stylesheet; no global production styling changes. Build, CI and production release are pending.

No auth, schema, fee, provider connection or publication changes. This is independent of the #245 hosted management dependencies. Rollback: preceding main 3064679 / glohaus1 dpl_4vNRc9g9CBkb5S2PfE564MmCahCU.
