import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "public", "ruta-acordeon-logo.jpeg");
const LOGO_CID = "ruta-acordeon-logo";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !from) {
    return null;
  }

  const transportConfig = {
    host,
    port,
    secure
  };

  if (user && pass) {
    transportConfig.auth = { user, pass };
  }

  return {
    transporter: nodemailer.createTransport(transportConfig),
    from
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEventName() {
  return process.env.EVENT_NAME || "Ruta del Acordeón 10K";
}

function getEventDate() {
  return process.env.EVENT_DATE || "Domingo, 2 de agosto de 2026";
}

function getEventLocation() {
  return process.env.EVENT_LOCATION || "Villanueva, La Guajira";
}

function getRegistrationCode(registration) {
  const source = registration.id || registration.documentNumber || Date.now().toString();
  return `RDA-${String(source).replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
}

function getDistance(registration) {
  const text = `${registration.participationType || ""} ${registration.category || ""}`.toLowerCase();

  if (text.includes("5 km") || text.includes("5k")) {
    return "5 KM";
  }

  return "10 KM";
}

function buildSummary(registration) {
  return [
    ["Nombre", registration.fullName],
    ["Documento", registration.documentNumber],
    ["Distancia", getDistance(registration)],
    ["Categoría", registration.category],
    ["Número de inscripción", getRegistrationCode(registration)],
    ["Fecha del evento", getEventDate()],
    ["Lugar", getEventLocation()]
  ];
}

function renderSummaryRows(summary) {
  return summary
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 10px 0; color: #5d6b5f; font-size: 14px;">${escapeHtml(label)}</td>
          <td style="padding: 10px 0; color: #102416; font-size: 14px; font-weight: 700; text-align: right;">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join("");
}

function renderTextEmail(registration, summary) {
  return [
    `Hola, ${registration.fullName},`,
    "",
    "¡Excelente noticia! 🎉",
    "",
    "Hemos verificado satisfactoriamente el pago de tu inscripción y nos complace confirmar que ya haces parte oficialmente de la Ruta del Acordeón 10K.",
    "",
    "Resumen de tu inscripción:",
    "",
    ...summary.filter(([, value]) => value).map(([label, value]) => `- ${label}: ${value}`),
    "",
    "En los próximos días recibirás información importante sobre:",
    "",
    "- Entrega del kit de competencia.",
    "- Horarios y programación del evento.",
    "- Recomendaciones para el día de la carrera.",
    "- Reglamento y recorrido oficial.",
    "",
    "Te recomendamos conservar este correo como comprobante de que tu inscripción fue confirmada.",
    "",
    "¡Gracias por confiar en nosotros y ser parte de esta gran fiesta del atletismo! Nos llena de orgullo contar con tu participación y esperamos verte en la línea de salida para vivir juntos una experiencia inolvidable.",
    "",
    "¡Nos vemos en la Ruta del Acordeón 10K!",
    "",
    "Cordialmente,",
    "",
    "Comité Organizador",
    "Ruta del Acordeón 10K",
    "Villanueva, La Guajira"
  ].join("\n");
}

function renderHtmlEmail(registration, summary) {
  const participantName = escapeHtml(registration.fullName);
  const eventName = escapeHtml(getEventName());
  const summaryRows = renderSummaryRows(summary);

  return `
    <div style="margin: 0; padding: 0; background: #edf5e7; font-family: Arial, Helvetica, sans-serif; color: #102416;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background: #edf5e7; padding: 28px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 680px; border-collapse: collapse; overflow: hidden; border-radius: 28px; background: #ffffff; box-shadow: 0 18px 45px rgba(9, 32, 16, 0.16);">
              <tr>
                <td style="background: linear-gradient(135deg, #082513 0%, #143b1f 58%, #8cff00 160%); padding: 30px 28px; text-align: center;">
                  <img src="cid:${LOGO_CID}" alt="Ruta del Acordeón" width="150" style="display: inline-block; max-width: 150px; width: 150px; height: auto; border-radius: 20px; margin-bottom: 18px;" />
                  <p style="margin: 0 0 8px; color: #b9ff00; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">Inscripción confirmada</p>
                  <h1 style="margin: 0; color: #ffffff; font-size: 30px; line-height: 1.15; font-weight: 800;">${eventName}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px 28px 12px;">
                  <p style="margin: 0 0 18px; font-size: 17px; line-height: 1.65;">Hola, <strong>${participantName}</strong>,</p>
                  <p style="margin: 0 0 18px; font-size: 20px; line-height: 1.5; font-weight: 800; color: #0d351a;">¡Excelente noticia! 🎉</p>
                  <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #2d3a30;">
                    Hemos verificado satisfactoriamente el pago de tu inscripción y nos complace confirmar que ya haces parte oficialmente de la <strong>Ruta del Acordeón 10K</strong>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 28px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background: #f6fbf1; border: 1px solid #d9ead0; border-radius: 20px; overflow: hidden;">
                    <tr>
                      <td style="padding: 20px 22px;">
                        <h2 style="margin: 0 0 10px; color: #102416; font-size: 20px;">Resumen de tu inscripción</h2>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                          ${summaryRows}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 28px 8px;">
                  <p style="margin: 0 0 12px; font-size: 16px; line-height: 1.65; color: #2d3a30;">En los próximos días recibirás información importante sobre:</p>
                  <ul style="margin: 0; padding-left: 20px; color: #2d3a30; font-size: 15px; line-height: 1.8;">
                    <li>Entrega del kit de competencia.</li>
                    <li>Horarios y programación del evento.</li>
                    <li>Recomendaciones para el día de la carrera.</li>
                    <li>Reglamento y recorrido oficial.</li>
                  </ul>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 28px 30px;">
                  <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: #526057;">
                    Te recomendamos conservar este correo como comprobante de que tu inscripción fue confirmada.
                  </p>
                  <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.7; color: #2d3a30;">
                    ¡Gracias por confiar en nosotros y ser parte de esta gran fiesta del atletismo! Nos llena de orgullo contar con tu participación y esperamos verte en la línea de salida para vivir juntos una experiencia inolvidable.
                  </p>
                  <p style="margin: 0; font-size: 18px; line-height: 1.5; font-weight: 800; color: #0d351a;">¡Nos vemos en la Ruta del Acordeón 10K!</p>
                </td>
              </tr>
              <tr>
                <td style="background: #092513; padding: 22px 28px; color: #f3ffe6;">
                  <p style="margin: 0 0 4px; font-size: 15px; font-weight: 700;">Comité Organizador</p>
                  <p style="margin: 0; font-size: 14px; color: #cdeeb8;">Ruta del Acordeón 10K · Villanueva, La Guajira</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export async function sendApprovalEmail(registration) {
  const transport = getTransporter();

  if (!transport) {
    return {
      sent: false,
      error: "SMTP no configurado. Define SMTP_HOST y SMTP_FROM para enviar correos."
    };
  }

  const summary = buildSummary(registration);
  const html = renderHtmlEmail(registration, summary);
  const text = renderTextEmail(registration, summary);

  try {
    await transport.transporter.sendMail({
      from: transport.from,
      to: registration.email,
      subject: `Inscripción confirmada - ${getEventName()}`,
      html,
      text,
      attachments: [
        {
          filename: "ruta-acordeon-logo.jpeg",
          path: LOGO_PATH,
          cid: LOGO_CID
        }
      ]
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error.message || "No fue posible enviar el correo."
    };
  }
}