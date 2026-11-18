// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { CustomerProfileEditor } from "@/components/customer-profile-editor";
import type { CustomerProfile } from "@/modules/accounts/customer-profile";

const mocks = vi.hoisted(() => ({
  readImageFile: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/image-file", () => ({
  readImageFile: mocks.readImageFile,
  imageInputAccept: "image/jpeg,image/png,image/webp,image/heic,image/heif",
  isSupportedImageFile: () => true,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/image", () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  // jsdom does not propagate a programmatically assigned FileList into
  // FormData(form). Reproduce the browser's selected-file behaviour only.
  const BrowserFormData = window.FormData;
  vi.stubGlobal("FormData", class extends BrowserFormData {
    constructor(form?: HTMLFormElement) {
      super(form);
      const file = form?.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
      if (file) this.set("photo", file);
    }
  });
  mocks.readImageFile.mockResolvedValue("data:image/webp;base64,YWJj");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function choosePhoto() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["photo"], "phone-photo.jpg", { type: "image/jpeg" })],
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function submitPhotoForm() {
  const form = container.querySelector<HTMLFormElement>('input[type="file"]')!.closest("form")!;
  await act(async () =>
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("saves the customer's prepared photo without decoding it a second time", async () => {
  await act(async () =>
    root.render(
      React.createElement(CustomerProfileEditor, {
        profile: { first_name: "Test", last_name: "", has_photo: false } as CustomerProfile,
        userId: "test-user",
      }),
    ),
  );
  await choosePhoto();
  expect(mocks.readImageFile).toHaveBeenCalledTimes(1);
  expect(mocks.readImageFile.mock.calls[0][1]).toEqual({ profile: true });
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 201 }));
  await submitPhotoForm();
  expect(mocks.readImageFile).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
    base64: "YWJj",
    altText: "Customer profile photo",
  });
  expect(container.textContent).toContain("Your photo has been saved.");
});
it("keeps a professional's prepared photo on failed save and explains an expired session", async () => {
  await act(async () =>
    root.render(React.createElement(ProfilePhotoEditor, { photo: null, published: false })),
  );
  await choosePhoto();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
  );
  await submitPhotoForm();
  expect(container.textContent).toContain("Your session expired");
  expect(container.querySelector<HTMLButtonElement>('button.button')?.disabled).toBe(false);
  expect(mocks.readImageFile).toHaveBeenCalledTimes(1);
});
it("allows a professional to retry saving the existing preview after a server failure", async () => {
  await act(async () =>
    root.render(React.createElement(ProfilePhotoEditor, { photo: null, published: false })),
  );
  await choosePhoto();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ id: "profile-photo-id" }, { status: 201 }));
  await submitPhotoForm();
  expect(container.textContent).toContain("temporarily unavailable");
  await submitPhotoForm();
  expect(container.textContent).toContain("Profile photo saved.");
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  expect(mocks.readImageFile).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalled();
});

for (const kind of ["customer", "professional"] as const) {
  it(`prevents duplicate ${kind} photo requests while a save is pending`, async () => {
    await act(async () => root.render(kind === "professional"
      ? React.createElement(ProfilePhotoEditor, { photo: null, published: false })
      : React.createElement(CustomerProfileEditor, { profile: { first_name: "Test", last_name: "", has_photo: false } as CustomerProfile, userId: "test-user" })));
    await choosePhoto();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const form = container.querySelector<HTMLInputElement>('input[type="file"]')!.closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(Response.json({ id: "saved-photo" }, { status: 201 })));
  });
}

for (const kind of ["customer", "professional"] as const) {
  it(`releases ${kind} photo controls after an unconfirmed timeout and retains the preview`, async () => {
    await act(async () => root.render(kind === "professional"
      ? React.createElement(ProfilePhotoEditor, { photo: null, published: false })
      : React.createElement(CustomerProfileEditor, { profile: { first_name: "Test", last_name: "", has_photo: false } as CustomerProfile, userId: "test-user" })));
    await choosePhoto();
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    await submitPhotoForm();
    expect(container.textContent).toContain("Check your profile before retrying");
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput.disabled).toBe(false);
    const save = Array.from(fileInput.closest("form")!.querySelectorAll("button")).find(button => button.textContent?.includes("Save"))!;
    expect(save.disabled).toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ id: "saved-after-check" }, { status: 201 }));
    await submitPhotoForm();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.readImageFile).toHaveBeenCalledTimes(1);
  });
}
