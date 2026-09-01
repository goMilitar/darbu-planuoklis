// Gmail integration via Replit connector (google-mail)
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

const OWNER_EMAIL = "tomas.paragis@gmail.com";

function buildMimeMessage(to: string, subject: string, htmlBody: string): string {
  const boundary = "boundary_" + Date.now();
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(htmlBody).toString("base64"),
  ];
  return lines.join("\r\n");
}

export async function sendPerformanceAlert(params: {
  employeeName: string;
  date: string;
  performancePct: number;
  closeComment?: string;
}) {
  try {
    const gmail = await getUncachableGmailClient();

    const dateFormatted = new Date(params.date + "T00:00:00").toLocaleDateString("lt-LT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const ratingColor = params.performancePct >= 80 ? "#f59e0b" : params.performancePct >= 60 ? "#f97316" : "#ef4444";
    const ratingLabel = params.performancePct >= 80 ? "Beveik pasiekta" : params.performancePct >= 60 ? "Žemiau normos" : "Kritiškai žema";

    const subject = `⚠ Dienos norma neįvykdyta: ${params.employeeName} — ${params.performancePct}%`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 4px;">Sandėlio Planas</h2>
        <p style="color: #666; font-size: 14px; margin-top: 0;">Dienos normos pranešimas</p>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Darbuotojas</td>
            <td style="padding: 8px 0; font-weight: 600; text-align: right;">${params.employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Data</td>
            <td style="padding: 8px 0; text-align: right;">${dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Normos įvykdymas</td>
            <td style="padding: 8px 0; text-align: right;">
              <span style="font-size: 20px; font-weight: 700; color: ${ratingColor};">${params.performancePct}%</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Vertinimas</td>
            <td style="padding: 8px 0; text-align: right;">
              <span style="background: ${ratingColor}20; color: ${ratingColor}; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 500;">${ratingLabel}</span>
            </td>
          </tr>
          ${params.closeComment ? `
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Priežastis</td>
            <td style="padding: 8px 0; text-align: right;">${params.closeComment}</td>
          </tr>` : ""}
        </table>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">Automatinis pranešimas iš Sandėlio Planas sistemos</p>
      </div>
    `;

    const raw = Buffer.from(buildMimeMessage(OWNER_EMAIL, subject, html))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`[gmail] Performance alert sent for ${params.employeeName} (${params.performancePct}%)`);
  } catch (error) {
    console.error("[gmail] Failed to send performance alert:", error);
  }
}

export async function sendClockOutReminder(params: {
  to: string;
  employeeName: string;
  date: string;
  workStartedAt: Date | string;
}) {
  try {
    const gmail = await getUncachableGmailClient();

    const dateFormatted = new Date(params.date + "T00:00:00").toLocaleDateString("lt-LT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const startedFormatted = new Date(params.workStartedAt).toLocaleString("lt-LT", {
      timeZone: "Europe/Vilnius",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });

    const subject = `⏰ Priminimas: pažymėkite darbo pabaigą — ${dateFormatted}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 4px;">Sandėlio Planas</h2>
        <p style="color: #666; font-size: 14px; margin-top: 0;">Darbo pabaigos priminimas</p>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
        <p style="font-size: 15px; line-height: 1.5;">
          Sveiki, <strong>${params.employeeName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.5;">
          Pastebėjome, kad pažymėjote darbo pradžią <strong>${startedFormatted}</strong>, bet dar nepažymėjote darbo pabaigos.
        </p>
        <p style="font-size: 15px; line-height: 1.5;">
          Prašome prisijungti į sistemą ir spustelėti <strong>„Baigti darbą"</strong> savo dienos plane, kad būtų teisingai užfiksuotas dirbtas laikas.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Data</td>
            <td style="padding: 8px 0; text-align: right;">${dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Darbo pradžia</td>
            <td style="padding: 8px 0; text-align: right;">${startedFormatted}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">Automatinis pranešimas iš Sandėlio Planas sistemos</p>
      </div>
    `;

    const raw = Buffer.from(buildMimeMessage(params.to, subject, html))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`[gmail] Clock-out reminder sent to ${params.to} (${params.employeeName})`);
    return true;
  } catch (error) {
    console.error("[gmail] Failed to send clock-out reminder:", error);
    return false;
  }
}
