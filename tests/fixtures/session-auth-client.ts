type Listener = (
  event: string,
  session: { user: { id: string } } | null,
) => void;
export function sessionUser() {
  return localStorage.getItem("fixture-auth-user");
}
export function changeSession(id: string | null) {
  if (id) localStorage.setItem("fixture-auth-user", id);
  else localStorage.removeItem("fixture-auth-user");
  window.dispatchEvent(new Event("fixture-auth"));
}
export function createClient() {
  return {
    auth: {
      onAuthStateChange(callback: Listener) {
        const session = () => {
          const id = sessionUser();
          return id ? { user: { id } } : null;
        };
        const change = () =>
          callback(sessionUser() ? "SIGNED_IN" : "SIGNED_OUT", session());
        const storage = (event: StorageEvent) => {
          if (event.key === "fixture-auth-user") change();
        };
        let active = true;
        queueMicrotask(() => {
          if (active) callback("INITIAL_SESSION", session());
        });
        window.addEventListener("fixture-auth", change);
        window.addEventListener("storage", storage);
        return {
          data: {
            subscription: {
              unsubscribe() {
                active = false;
                window.removeEventListener("fixture-auth", change);
                window.removeEventListener("storage", storage);
              },
            },
          },
        };
      },
      async signOut() {
        if (sessionStorage.getItem("fail-signout")) {
          sessionStorage.removeItem("fail-signout");
          return { error: new Error("Temporary failure") };
        }
        changeSession(null);
        return { error: null };
      },
    },
  };
}
