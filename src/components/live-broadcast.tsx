"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalTrack } from "livekit-client";

type Connection = { session: { id: string; title: string }; serverUrl: string; participantToken: string };

export function LiveBroadcast({ host = false, sessionId, enabled = true }: { host?: boolean; sessionId?: string; enabled?: boolean }) {
  const media = useRef<HTMLDivElement>(null);
  const room = useRef<Room | null>(null);
  const activeSession = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Ready when you are");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [watchUrl, setWatchUrl] = useState("");
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      room.current?.removeAllListeners();
      void room.current?.disconnect();
      if (host && activeSession.current)
        void fetch("/api/v1/professional/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSession.current }), keepalive: true });
    };
  }, [host]);

  async function endBroadcast() {
    setBusy(true);
    setError("");
    try {
      if (host && activeSession.current) {
        const response = await fetch("/api/v1/professional/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSession.current }) });
        if (!response.ok) throw new Error("Could not end the broadcast. Please retry.");
        activeSession.current = undefined;
      }
      await room.current?.disconnect();
      media.current?.replaceChildren();
      setConnected(false);
      setStatus(host ? "Broadcast ended" : "You have left the broadcast");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setHasActiveSession(Boolean(activeSession.current)); setBusy(false); }
  }

  async function join() {
    if (busy || connected) return;
    setBusy(true);
    setError("");
    setStatus(host ? "Connecting your camera and microphone…" : "Joining the broadcast…");
    const next = new Room({ adaptiveStream: true, dynacast: true });
    room.current = next;
    const localTracks: LocalTrack[] = [];
    try {
      // Ask for devices before publishing a live session in the database.
      if (host) {
        const { createLocalTracks } = await import("livekit-client");
        localTracks.push(...await createLocalTracks({ audio: true, video: { facingMode: "user" } }));
      }
      if (!mounted.current) { localTracks.forEach(track => track.stop()); return; }
      const response = await fetch(host ? "/api/v1/professional/live/start" : `/api/v1/live/${sessionId}/token`, host ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
      } : { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (data.error?.code === "LIVE_NOT_ELIGIBLE") throw new Error("Your account does not currently meet the LIVE requirements.");
        if (response.status === 401) throw new Error("Please sign in again to join LIVE.");
        throw new Error("This broadcast is unavailable. It may have ended, or LIVE setup may still be pending.");
      }
      const connection = data as Connection;
      if (host) activeSession.current = connection.session.id;
      next.on(RoomEvent.TrackSubscribed, track => {
        const element = track.attach();
        if (element instanceof HTMLVideoElement) element.playsInline = true;
        media.current?.appendChild(element);
      });
      next.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(element => element.remove()));
      next.on(RoomEvent.Reconnecting, () => setStatus("Reconnecting…"));
      next.on(RoomEvent.Reconnected, () => setStatus(host ? "You are LIVE" : "Watching LIVE"));
      next.on(RoomEvent.Disconnected, () => { setConnected(false); setStatus("Broadcast disconnected or ended"); });
      await next.connect(connection.serverUrl, connection.participantToken);
      if (!mounted.current) throw new Error("Broadcast closed");
      for (const track of localTracks) {
        await next.localParticipant.publishTrack(track);
        if (track.kind === Track.Kind.Video) {
          const element = track.attach();
          element.muted = true;
          if (element instanceof HTMLVideoElement) element.playsInline = true;
          media.current?.appendChild(element);
        }
      }
      setWatchUrl(`${window.location.origin}/live/${connection.session.id}`);
      setConnected(true);
      setStatus(host ? "You are LIVE" : "Watching LIVE");
    } catch (cause) {
      localTracks.forEach(track => track.stop());
      await next.disconnect();
      if (host && activeSession.current) {
        const response = await fetch("/api/v1/professional/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSession.current }) }).catch(() => null);
        if (response?.ok) activeSession.current = undefined;
      }
      if (mounted.current) {
        setStatus("Not broadcasting");
        setError(cause instanceof Error && cause.name === "NotAllowedError" ? "Allow camera and microphone access in your browser, then try again." : cause instanceof Error ? cause.message : "Unable to connect. Please try again.");
      }
    } finally { if (mounted.current) { setHasActiveSession(Boolean(activeSession.current)); setBusy(false); } }
  }

  return <section className="gh-live-studio">
    <p role="status" aria-live="polite">{status}</p>
    <div className="gh-live-media" ref={media} aria-label={host ? "Your broadcast preview" : "Live video"} />
    {host && !connected && <label>Broadcast title<input maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="What are you sharing today?" /></label>}
    {error && <p role="alert">{error}</p>}
    {!enabled && <p>LIVE connection setup is pending. You can return when it is ready.</p>}
    {!connected ? <button className="pro-dark-button" disabled={!enabled || busy || (host && !title.trim())} onClick={() => void join()}>{busy ? "Connecting…" : host ? "Go LIVE" : "Watch LIVE"}</button> : <button className="pro-dark-button" disabled={busy} onClick={() => void endBroadcast()}>{host ? "End broadcast" : "Leave broadcast"}</button>}
    {host && !connected && hasActiveSession && <button disabled={busy} onClick={() => void endBroadcast()}>End the previous broadcast</button>}
    {host && watchUrl && <label>Share your broadcast<input readOnly value={watchUrl} onFocus={event => event.target.select()} /></label>}
    {host && <p>Your camera and microphone are shared only after you choose Go LIVE. Close the broadcast with End broadcast.</p>}
  </section>;
}
