import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { Readable } from "stream";

/**
 * Export an existing Google Doc as PDF and upload it to Drive alongside the doc.
 * Returns the webViewLink of the uploaded PDF.
 */
export async function exportDocAsPdfToDrive(
  docId: string,
  title: string,
  serviceAccountKeyPath: string,
  folderId?: string,
  shareWithEmail?: string
): Promise<string> {
  const key = JSON.parse(readFileSync(serviceAccountKeyPath, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  const drive = google.drive({ version: "v3", auth });

  const exported = await drive.files.export(
    { fileId: docId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  const pdfBuffer = Buffer.from(exported.data as ArrayBuffer);

  const res = await drive.files.create({
    requestBody: {
      name: `${title}.pdf`,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    fields: "id,webViewLink",
  });

  const pdfId = res.data.id;
  const pdfUrl = res.data.webViewLink;
  if (!pdfId || !pdfUrl) throw new Error("PDF upload returned no ID or URL.");

  if (shareWithEmail) {
    await drive.permissions.create({
      fileId: pdfId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: shareWithEmail,
      },
    });
  }

  return pdfUrl;
}

/**
 * Convert a local HTML file to PDF using headless Chrome/Chromium.
 * Returns true on success, false if no Chrome binary was found or conversion failed.
 */
export function htmlToPdfLocally(htmlPath: string, pdfPath: string): boolean {
  const chrome = findChrome();
  if (!chrome) return false;

  try {
    execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        htmlPath,
      ],
      { stdio: "pipe", timeout: 60_000 }
    );
    return existsSync(pdfPath);
  } catch {
    return false;
  }
}

function findChrome(): string | undefined {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find(existsSync);
}
