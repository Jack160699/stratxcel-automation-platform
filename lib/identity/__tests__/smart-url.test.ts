import assert from "node:assert/strict";
import {
  normalizeWebsiteUrl,
  normalizePlatformInput,
  detectPlatformFromInput,
  extractAllSocialLinksFromHtml,
  isSafeProtocol,
} from "../smart-url.ts";

function run() {
  console.log("Starting Smart URL Normalization test suite...");

  // 1. URL Safety checks
  assert.equal(isSafeProtocol("https://xyzconsultants.in"), true);
  assert.equal(isSafeProtocol("http://xyzconsultants.in"), true);
  assert.equal(isSafeProtocol("javascript:alert(1)"), false);
  assert.equal(isSafeProtocol("data:text/html;base64,..."), false);
  assert.equal(isSafeProtocol("file:///etc/passwd"), false);
  assert.equal(isSafeProtocol("vbscript:msgbox(1)"), false);

  // 2. Website Normalization
  const web1 = normalizeWebsiteUrl("xyzconsultants.in");
  assert.equal(web1.ok, true);
  assert.equal(web1.url, "https://xyzconsultants.in");
  assert.equal(web1.host, "xyzconsultants.in");

  const web2 = normalizeWebsiteUrl("www.xyzconsultants.in/");
  assert.equal(web2.ok, true);
  assert.equal(web2.url, "https://www.xyzconsultants.in");

  const web3 = normalizeWebsiteUrl("https://xyzconsultants.in/services?ref=google");
  assert.equal(web3.ok, true);
  assert.equal(web3.url, "https://xyzconsultants.in/services?ref=google");

  const webInvalid = normalizeWebsiteUrl("not a url");
  assert.equal(webInvalid.ok, false);

  // 3. Instagram Normalization
  const ig1 = normalizePlatformInput("instagram", "@xyzconsultants");
  assert.equal(ig1.ok, true);
  assert.equal(ig1.canonicalUrl, "https://www.instagram.com/xyzconsultants/");
  assert.equal(ig1.displayHandle, "@xyzconsultants");

  const ig2 = normalizePlatformInput("instagram", "instagram.com/xyzconsultants/?hl=en");
  assert.equal(ig2.ok, true);
  assert.equal(ig2.canonicalUrl, "https://www.instagram.com/xyzconsultants/");
  assert.equal(ig2.displayHandle, "@xyzconsultants");

  const ig3 = normalizePlatformInput("instagram", "https://www.instagram.com/xyzconsultants/");
  assert.equal(ig3.ok, true);
  assert.equal(ig3.canonicalUrl, "https://www.instagram.com/xyzconsultants/");

  // 4. Facebook Normalization
  const fb1 = normalizePlatformInput("facebook", "https://www.facebook.com/xyzconsultants");
  assert.equal(fb1.ok, true);
  assert.equal(fb1.canonicalUrl, "https://www.facebook.com/xyzconsultants/");

  const fb2 = normalizePlatformInput("facebook", "pages/xyz-consultants/1029384756");
  assert.equal(fb2.ok, true);
  assert.equal(fb2.canonicalUrl, "https://www.facebook.com/pages/xyz-consultants/1029384756");

  // 5. YouTube Normalization
  const yt1 = normalizePlatformInput("youtube", "@xyzconsultants");
  assert.equal(yt1.ok, true);
  assert.equal(yt1.canonicalUrl, "https://www.youtube.com/@xyzconsultants");

  const yt2 = normalizePlatformInput("youtube", "https://youtu.be/c/xyzconsultants");
  assert.equal(yt2.ok, true);

  // 6. LinkedIn Normalization
  const li1 = normalizePlatformInput("linkedin", "company/xyz-consultants");
  assert.equal(li1.ok, true);
  assert.equal(li1.canonicalUrl, "https://www.linkedin.com/company/xyz-consultants");

  // 7. WhatsApp Normalization
  const wa1 = normalizePlatformInput("whatsapp", "+91 98765 43210");
  assert.equal(wa1.ok, true);
  assert.equal(wa1.canonicalUrl, "https://wa.me/919876543210");
  assert.equal(wa1.displayHandle, "+919876543210");

  // 8. Platform Auto-detection
  assert.equal(detectPlatformFromInput("https://www.instagram.com/test"), "instagram");
  assert.equal(detectPlatformFromInput("https://fb.com/test"), "facebook");
  assert.equal(detectPlatformFromInput("https://threads.net/@test"), "threads");
  assert.equal(detectPlatformFromInput("https://youtube.com/@test"), "youtube");
  assert.equal(detectPlatformFromInput("https://linkedin.com/company/test"), "linkedin");
  assert.equal(detectPlatformFromInput("https://maps.app.goo.gl/123"), "google_business");
  assert.equal(detectPlatformFromInput("https://xyzconsultants.in"), "website");

  // 9. HTML Social Link Extraction
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>XYZ Consultants</title></head>
      <body>
        <footer>
          <a href="https://instagram.com/xyzconsultants?igshid=123">Instagram</a>
          <a href="https://facebook.com/xyzconsultants">Facebook</a>
          <a href="https://linkedin.com/company/xyzconsultants">LinkedIn</a>
          <a href="javascript:void(0)">Ignore Unsafe</a>
        </footer>
      </body>
    </html>
  `;
  const extracted = extractAllSocialLinksFromHtml(sampleHtml);
  assert.equal(extracted.length, 3);
  assert.ok(extracted.some((s) => s.platform === "instagram" && s.handle === "@xyzconsultants"));
  assert.ok(extracted.some((s) => s.platform === "facebook"));
  assert.ok(extracted.some((s) => s.platform === "linkedin"));

  console.log("smart-url.test.ts: ALL PASS (safe protocol validation, multi-format normalization, provider detection, HTML extraction)");
}

run();
