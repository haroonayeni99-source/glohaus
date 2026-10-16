import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { inAppNotifications } from "@/modules/notifications/repository";
import { apiError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const identity = await getIdentity();
    const snapshot = () =>
      withIdentity(identity.authId, async (db) => {
        authorize(await findAccount(db, identity.authId), identity);
        return {
          notifications: await inAppNotifications(db),
          unread: (
            await db.query<{ count: number }>(
              "SELECT count(*)::integer AS count FROM beauty.in_app_notifications WHERE read_at IS NULL",
            )
          ).rows[0].count,
        };
      });
    const initial = await snapshot();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      wake?.();
    };
    request.signal.addEventListener("abort", stop, { once: true });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let previous = "";
        try {
          for (let n = 0; n < 6 && !stopped; n++) {
            const data = JSON.stringify(n === 0 ? initial : await snapshot());
            if (data !== previous) {
              controller.enqueue(
                encoder.encode(`event: notifications\ndata: ${data}\n\n`),
              );
              previous = data;
            } else controller.enqueue(encoder.encode(": keepalive\n\n"));
            if (n < 5)
              await new Promise<void>((resolve) => {
                wake = resolve;
                timer = setTimeout(resolve, 5000);
              });
          }
        } catch {
          if (!stopped)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        } finally {
          stop();
          request.signal.removeEventListener("abort", stop);
          try {
            controller.close();
          } catch {}
        }
      },
      cancel: stop,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
