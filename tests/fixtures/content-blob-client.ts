// Test-only replacement for Blob client uploads; no storage requests or secrets.
export async function upload(
  pathname: string,
  file: File,
  options: {
    multipart?: boolean;
    access: string;
    contentType?: string;
    clientPayload?: string;
    onUploadProgress?: (p: { percentage: number }) => void;
  },
) {
  const records = JSON.parse(sessionStorage.getItem("video-uploads") || "[]");
  records.push({ size: file.size, type: file.type, ...options, pathname });
  sessionStorage.setItem("video-uploads", JSON.stringify(records));
  options.onUploadProgress?.({ percentage: 100 });
  return { pathname };
}
