"use client";
import Link from "next/link";

export function ProfileExamplesReset() {
  return (
    <Link
      href="/profile-examples"
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.currentTarget.closest("form")?.reset();
        }
      }}
    >
      Reset
    </Link>
  );
}
