import { google, type docs_v1 } from "googleapis";
import { readFileSync } from "fs";

export async function createAuditGoogleDoc(
  title: string,
  markdownContent: string,
  serviceAccountKeyPath: string,
  folderId?: string,
  shareWithEmail?: string
): Promise<{ url: string; id: string }> {
  const key = JSON.parse(readFileSync(serviceAccountKeyPath, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents",
    ],
  });

  const drive = google.drive({ version: "v3", auth });

  // Upload as plain text — Google Drive auto-converts to Google Doc
  const res = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: {
      mimeType: "text/plain",
      body: markdownContent,
    },
    fields: "id,webViewLink",
  });

  const docId = res.data.id;
  const docUrl = res.data.webViewLink;

  if (!docId || !docUrl) throw new Error("Google Drive file creation returned no ID or URL.");

  // Apply basic formatting via the Docs API
  await applyDocFormatting(docId, auth);

  // Share with the requesting user — Google emails them the link and the doc
  // appears in their "Shared with me".
  if (shareWithEmail) {
    await drive.permissions.create({
      fileId: docId,
      sendNotificationEmail: true,
      emailMessage: "Your website audit report is ready.",
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: shareWithEmail,
      },
    });
  }

  return { url: docUrl, id: docId };
}

async function applyDocFormatting(docId: string, auth: docs_v1.Options["auth"]) {
  try {
    const docs = google.docs({ version: "v1", auth });

    // Get the document to find the end of content
    const doc = await docs.documents.get({ documentId: docId });
    const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1;

    // Apply title style to the first line
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            updateParagraphStyle: {
              range: { startIndex: 1, endIndex: Math.min(80, endIndex - 1) },
              paragraphStyle: { namedStyleType: "TITLE" },
              fields: "namedStyleType",
            },
          },
        ],
      },
    });
  } catch {
    // Formatting is best-effort — doc is still usable as plain text
  }
}
