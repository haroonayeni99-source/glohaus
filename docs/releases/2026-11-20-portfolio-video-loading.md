# Selected-video buffering feedback

A slow first frame previously left the selected upload blank despite the player having started its play request. This scoped change reuses the existing three pink dots after 200 ms of actual playback waiting. First-frame/playing/pause/error events clear them; autoplay rejection returns to the existing Play control. Reduced-motion visitors retain explicit playback. Closing removes the pending indicator with the selected video. Only the video area is affected; controls stay available.

Ten focused viewer/loading cases, TypeScript and scoped lint passed. Runner browser acceptance must verify delayed media in light/night, recovery to actual decoded playback and closing while pending. The local test harness loads the existing shared indicator stylesheet; no global production styling changes. All four corrected-head workflows passed at 8a24c86, including all 17 foundation jobs. The full suite passed 1,821 tests with two existing skips. Local production build passed; Preview dpl_8HGfaKVGHmzq3iHCx1SF7ghqtVqb was READY on the initial identical application source. A tracked synthetic five-second H.264 fixture now replaces encoder downloads in all three media browser harnesses; browser decoding/playback/upload assertions remain required.

No auth, schema, fee, provider connection or publication changes. This is independent of the #245 hosted management dependencies. Rollback: preceding main 3064679 / glohaus1 dpl_4vNRc9g9CBkb5S2PfE564MmCahCU.


## Production acceptance

#255 merged c84248cc8c7befa2b806e54efe71381eebc7aa22; glohaus1 dpl_GXL8ZFraSbcrBF3CMtVWDpmdh5DX READY on www.glohaus.shop. Its root tree matched the verified PR. Real public-profile Chromium checks decoded the existing 4096×2160 upload with advancing time and muted autoplay, surface pause/resume, separate sound, arrow navigation with one selected video, and close returning to scrollY 988 and the opener. Dark-theme playback also advanced; the scoped loading colour resolved to #e8438a. No stale indicator remained after playback, pause or closing. Slow-network dots themselves were deterministically verified in the browser fixtures, not claimed as captured during the faster live media load. No physical-phone or new signed-in management acceptance is claimed.

Home, Shop, Discover and profile rendered main content without streamed RSC error digests. The initial deployment error/fatal log scan was empty; this is a point-in-time check. No social connection flags, database, account, booking, payment or fee changes. Rollback remains 3064679 / dpl_4vNRc9g9CBkb5S2PfE564MmCahCU.
