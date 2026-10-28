export function useRouter() {
  return { refresh() {}, push(href: string) { localStorage.setItem("ui-audit-last-navigation", href); } };
}

export function usePathname() { return location.pathname; }
