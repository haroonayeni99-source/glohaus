export function readImageFile(file: File): Promise<string> {
  if (!file.size || file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Choose a JPEG, PNG or WebP image up to 3 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}
