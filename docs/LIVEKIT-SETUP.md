# GLOHAUS LIVE

Production Vercel project: `glohaus1`. Set `LIVEKIT_URL` (the project's `wss://`
URL), `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in its Production environment.
Store the key and secret as sensitive server-only values, then redeploy.
Do not put the API secret in source control or any `NEXT_PUBLIC_` variable.

Eligible professionals open `/professional/live` from the dashboard or Business
tools. Go LIVE requests camera/microphone permission, starts the authorized
database session, joins LiveKit and publishes local tracks. Share the resulting
`/live/[sessionId]` link with signed-in viewers. Viewers do not request devices
and receive room-scoped tokens without media or data publishing permission.
Tokens expire after ten minutes for joining; existing connections are managed
by LiveKit. Broadcast reconnections still use the account's eligibility checks.

End broadcast checks professional ownership, closes the LiveKit room (removing
viewers), and updates the application session. Closing the page attempts a
keepalive end request, but browsers do not guarantee delivery on a force-close
or loss of power/network. Provider webhooks/session reconciliation are still
needed before claiming crash-proof LIVE status. A failed start attempts to end
the application session and releases acquired camera/microphone tracks.

The production database already contains `beauty.live_sessions`,
`start_my_live_session`, `live_session_join_info`, and `end_my_live_session`.
These were installed outside the repository's numbered migration files. Fresh
database installs must reconcile that history before enabling LIVE; do not run
old migrations again against production.

Acceptance requires two real connections with the configured project: an
eligible professional broadcasting and a separate viewer receiving audio/video.
Check rejected device permission, reconnect, ended-room behaviour, unauthorized
room termination, and publishing denial for viewers. Without project credentials
and devices, unit tests and a production build do not establish that acceptance.
