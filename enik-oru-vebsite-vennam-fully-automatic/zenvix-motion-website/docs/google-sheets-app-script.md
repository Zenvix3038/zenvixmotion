# Google Sheets connection

1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Paste this script and deploy it as a Web App.
4. Set access to "Anyone with the link".
5. Copy the Web App URL and start the website with `GOOGLE_SHEET_WEBHOOK=your-url npm start`.

```js
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date(),
    data.type || "",
    data.name || "",
    data.phone || "",
    data.email || "",
    data.message || "",
    data.page || "",
    data.timezone || "",
    data.screen || "",
    data.ip || "",
    data.userAgent || ""
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```
