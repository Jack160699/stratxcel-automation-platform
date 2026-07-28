"use client";

export function uploadToSignedUrlWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percentage: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Private upload failed (${request.status}).`));
      }
    });
    request.addEventListener("error", () => reject(new Error("Private upload failed because the connection was interrupted.")));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.send(body);
  });
}
