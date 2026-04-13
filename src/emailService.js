import nodemailer from "nodemailer";

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

function buildRaceDetails(registration) {
  const items = [
    {
      label: "Evento",
      value: process.env.EVENT_NAME || "Carrera Atlética Ruta del Acordeón 10K - 2026"
    },
    {
      label: "Fecha",
      value: process.env.EVENT_DATE
    },
    {
      label: "Hora",
      value: process.env.EVENT_TIME
    },
    {
      label: "Lugar",
      value: process.env.EVENT_LOCATION
    },
    {
      label: "Categoría aprobada",
      value: registration.category
    },
    {
      label: "Tipo de participación",
      value: registration.participationType
    },
    {
      label: "Contacto del evento",
      value: process.env.EVENT_CONTACT_EMAIL || process.env.EVENT_CONTACT_PHONE
    }
  ].filter((item) => item.value);

  return items;
}

export async function sendApprovalEmail(registration) {
  const transport = getTransporter();

  if (!transport) {
    return {
      sent: false,
      error: "SMTP no configurado. Define SMTP_HOST y SMTP_FROM para enviar correos."
    };
  }

  const raceDetails = buildRaceDetails(registration);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Inscripción aprobada</h2>
      <p>Hola <strong>${registration.fullName}</strong>, tu inscripción ha sido aprobada exitosamente.</p>
      <p>Te compartimos la información registrada para la carrera:</p>
      <ul>
        ${raceDetails.map((item) => `<li><strong>${item.label}:</strong> ${item.value}</li>`).join("")}
      </ul>
      <p>Recuerda presentarte con tu documento de identidad y seguir las instrucciones oficiales del evento.</p>
      <p>Gracias por hacer parte de esta experiencia deportiva.</p>
    </div>
  `;

  const text = [
    `Hola ${registration.fullName},`,
    "",
    "Tu inscripción ha sido aprobada exitosamente.",
    "",
    ...raceDetails.map((item) => `${item.label}: ${item.value}`),
    "",
    "Recuerda presentarte con tu documento de identidad y seguir las instrucciones oficiales del evento."
  ].join("\n");

  try {
    await transport.transporter.sendMail({
      from: transport.from,
      to: registration.email,
      subject: `Inscripción aprobada - ${process.env.EVENT_NAME || "Ruta del Acordeón 10K - 2026"}`,
      html,
      text
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error.message || "No fue posible enviar el correo."
    };
  }
}
