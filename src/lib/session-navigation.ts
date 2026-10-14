export function finishSignOut() {
  // A document navigation clears Next's prefetched/private page cache as well
  // as the rendered layout. Back/forward restores are checked by the provider.
  window.location.replace("/");
}
