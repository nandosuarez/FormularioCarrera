import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import multer from "multer";
import {
  CATEGORIES,
  DOCUMENT_TYPES,
  EMAIL_STATUS_LABELS,
  PARTICIPATION_TYPES,
  SEX_OPTIONS,
  SHIRT_SIZES,
  STATUS_LABELS
} from "./constants.js";
import {
  getUploadStorageMode,
  initializeStore,
  createRegistration,
  findAdminByUsername,
  findRegistrationByDocumentOrEmail,
  getRegistrationById,
  getRegistrationSummary,
  listRegistrations,
  updateRegistration
} from "./dataStore.js";
import { sendApprovalEmail } from "./emailService.js";
import { normalizeTextInput, validateRegistrationForm } from "./validators.js";

dotenv.config();

const appRoot = process.cwd();
const uploadDirectory = path.join(appRoot, "uploads");
const uploadStorageMode = getUploadStorageMode();
const receiptMaxSizeMb = Math.max(
  Number.parseInt(process.env.RECEIPT_MAX_SIZE_MB || "15", 10) || 15,
  1
);
const receiptMaxSizeBytes = receiptMaxSizeMb * 1024 * 1024;
const registrationsClosed =
  (process.env.REGISTRATIONS_CLOSED || "true").trim().toLowerCase() !== "false";

function buildStoredFileName(originalName) {
  const extension = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${crypto.randomUUID()}${extension}`;
}

const storage =
  uploadStorageMode === "database"
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, callback) => callback(null, uploadDirectory),
        filename: (_req, file, callback) => {
          callback(null, buildStoredFileName(file.originalname));
        }
      });

const upload = multer({
  storage,
  limits: {
    fileSize: receiptMaxSizeBytes
  }
});

const groupedCategories = [
  {
    title: "10 KM Competitiva",
    categories: CATEGORIES.filter((item) => item.participationType === "competitiva")
  },
  {
    title: "5 KM Categoría abierta",
    categories: CATEGORIES.filter((item) => item.participationType === "recreativa")
  }
];

const categoryOptions = CATEGORIES.map((category) => category.label);

function buildApprovedCategorySummary(registrations) {
  const countsByCategory = new Map(categoryOptions.map((category) => [category, 0]));

  registrations.forEach((registration) => {
    const category = registration.category || "Sin categoría";
    countsByCategory.set(category, (countsByCategory.get(category) || 0) + 1);
  });

  return Array.from(countsByCategory.entries()).map(([category, total]) => ({
    category,
    total,
    href: `/admin/inscripciones?status=approved&category=${encodeURIComponent(category)}`
  }));
}

function getQueryValue(value) {
  return (Array.isArray(value) ? value[0] : value || "").toString().trim();
}

function getAdminFilters(req) {
  const rawStatus = getQueryValue(req.query.status) || "all";
  const allowedStatuses = new Set(["all", "pending", "approved", "rejected"]);

  return {
    status: allowedStatuses.has(rawStatus) ? rawStatus : "all",
    query: getQueryValue(req.query.q),
    category: getQueryValue(req.query.category)
  };
}

async function listFilteredRegistrations(filters) {
  const registrations = await listRegistrations({
    status: filters.status,
    query: filters.query
  });

  if (!filters.category) {
    return registrations;
  }

  return registrations.filter((registration) => registration.category === filters.category);
}

function buildExportHref(filters) {
  const params = new URLSearchParams();

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  const queryString = params.toString();
  return `/admin/inscripciones/exportar${queryString ? `?${queryString}` : ""}`;
}

function formatExportDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "";
}

function getEmailStatusLabel(status) {
  return EMAIL_STATUS_LABELS[status] || status || "";
}

function excelCell(value, style = "Default", type = "String") {
  const dataType = type === "Number" && value !== "" && value !== null && value !== undefined
    ? "Number"
    : "String";

  return `<Cell ss:StyleID="${style}"><Data ss:Type="${dataType}">${escapeXml(value)}</Data></Cell>`;
}

function excelRow(cells, style = "Default") {
  return `<Row>${cells.map((cell) => excelCell(cell, style)).join("")}</Row>`;
}

function buildStatusSummary(registrations) {
  return registrations.reduce(
    (summary, registration) => {
      summary.total += 1;
      summary[registration.status] = (summary[registration.status] || 0) + 1;
      return summary;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 }
  );
}

function buildCategoryRows(registrations) {
  const counts = new Map();

  registrations.forEach((registration) => {
    const category = registration.category || "Sin categoría";
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB, "es"))
    .map(([category, total]) => [category, total]);
}

function buildExportColumns() {
  return [
    { label: "Estado", width: 92, value: (registration) => getStatusLabel(registration.status) },
    {
      label: "Correo aprobación",
      width: 118,
      value: (registration) => getEmailStatusLabel(registration.approvalEmailStatus)
    },
    { label: "Nombre completo", width: 210, value: (registration) => registration.fullName },
    { label: "Documento", width: 118, value: (registration) => registration.documentNumber },
    { label: "Tipo documento", width: 132, value: (registration) => registration.documentType },
    { label: "Celular", width: 110, value: (registration) => registration.phone },
    { label: "Correo electrónico", width: 190, value: (registration) => registration.email },
    { label: "Participación", width: 150, value: (registration) => registration.participationType },
    { label: "Categoría", width: 220, value: (registration) => registration.category },
    { label: "Sexo", width: 90, value: (registration) => registration.sex },
    { label: "Edad", width: 58, value: (registration) => registration.age, type: "Number" },
    { label: "Fecha nacimiento", width: 120, value: (registration) => registration.birthDate },
    { label: "Grupo sanguíneo", width: 108, value: (registration) => registration.bloodType },
    { label: "EPS o seguro", width: 150, value: (registration) => registration.insurance },
    { label: "Ciudad", width: 130, value: (registration) => registration.city },
    { label: "Dirección", width: 190, value: (registration) => registration.address },
    { label: "Condición médica", width: 125, value: (registration) => registration.medicalCondition },
    {
      label: "Detalle condición",
      width: 190,
      value: (registration) => registration.medicalDetails
    },
    { label: "Experiencia previa", width: 120, value: (registration) => registration.priorRace },
    { label: "Contacto emergencia", width: 180, value: (registration) => registration.emergencyName },
    {
      label: "Parentesco",
      width: 120,
      value: (registration) => registration.emergencyRelationship
    },
    { label: "Teléfono emergencia", width: 132, value: (registration) => registration.emergencyPhone },
    { label: "Talla", width: 62, value: (registration) => registration.shirtSize },
    { label: "Inscripción", width: 135, value: (registration) => formatExportDate(registration.createdAt) },
    { label: "Aprobación", width: 135, value: (registration) => formatExportDate(registration.approvedAt) },
    {
      label: "Correo enviado",
      width: 135,
      value: (registration) => formatExportDate(registration.approvalEmailSentAt)
    },
    { label: "Comprobante", width: 170, value: (registration) => registration.paymentReceipt?.originalName },
    { label: "Observaciones", width: 220, value: (registration) => registration.adminNotes },
    { label: "Error correo", width: 220, value: (registration) => registration.lastEmailError },
    { label: "ID interno", width: 210, value: (registration) => registration.id }
  ];
}

function buildExcelWorkbook(registrations, filters) {
  const generatedAt = formatExportDate(new Date().toISOString());
  const statusSummary = buildStatusSummary(registrations);
  const categoryRows = buildCategoryRows(registrations);
  const columns = buildExportColumns();
  const filterRows = [
    ["Estado", filters.status === "all" ? "Todos" : getStatusLabel(filters.status)],
    ["Búsqueda", filters.query || "Sin filtro"],
    ["Categoría", filters.category || "Todas"],
    ["Generado", generatedAt]
  ];

  const summaryRows = [
    ["Total exportado", statusSummary.total],
    ["Pendientes", statusSummary.pending],
    ["Aprobadas", statusSummary.approved],
    ["Rechazadas", statusSummary.rejected]
  ];

  const summarySheetRows = [
    `<Row ss:Height="30"><Cell ss:StyleID="Title" ss:MergeAcross="2"><Data ss:Type="String">Ruta del Acordeón - Resumen de inscripciones</Data></Cell></Row>`,
    `<Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="2"><Data ss:Type="String">Exportación administrativa para Excel</Data></Cell></Row>`,
    `<Row />`,
    excelRow(["Filtros aplicados", "Valor"], "Header"),
    ...filterRows.map((row) => excelRow(row, "Default")),
    `<Row />`,
    excelRow(["Resumen", "Total"], "Header"),
    ...summaryRows.map(([label, total]) =>
      `<Row>${excelCell(label)}${excelCell(total, "Number", "Number")}</Row>`
    ),
    `<Row />`,
    excelRow(["Categoría", "Total"], "Header"),
    ...(categoryRows.length
      ? categoryRows.map(([category, total]) =>
          `<Row>${excelCell(category)}${excelCell(total, "Number", "Number")}</Row>`
        )
      : [excelRow(["Sin registros para los filtros seleccionados", "0"])])
  ].join("");

  const inscriptionSheetRows = [
    `<Row ss:Height="30"><Cell ss:StyleID="Title" ss:MergeAcross="${columns.length - 1}"><Data ss:Type="String">Inscripciones Ruta del Acordeón</Data></Cell></Row>`,
    `<Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="${columns.length - 1}"><Data ss:Type="String">Registros exportados: ${statusSummary.total}</Data></Cell></Row>`,
    `<Row />`,
    `<Row>${columns.map((column) => excelCell(column.label, "Header")).join("")}</Row>`,
    ...registrations.map(
      (registration) =>
        `<Row>${columns
          .map((column) => excelCell(column.value(registration), column.type === "Number" ? "Number" : "Default", column.type))
          .join("")}</Row>`
    )
  ].join("");

  const columnDefinitions = columns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width}" />`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#142018"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#14361A" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Subtitle">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#4F5F56"/>
      <Interior ss:Color="#E7FF9C" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#246A4A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#14361A"/>
      </Borders>
    </Style>
    <Style ss:ID="Number">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#142018"/>
      <NumberFormat ss:Format="0"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Resumen">
    <Table>
      <Column ss:AutoFitWidth="0" ss:Width="210" />
      <Column ss:AutoFitWidth="0" ss:Width="120" />
      <Column ss:AutoFitWidth="0" ss:Width="260" />
      ${summarySheetRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Selected/>
      <Panes>
        <Pane>
          <Number>3</Number>
          <ActiveRow>1</ActiveRow>
        </Pane>
      </Panes>
    </WorksheetOptions>
  </Worksheet>
  <Worksheet ss:Name="Inscripciones">
    <Table>
      ${columnDefinitions}
      ${inscriptionSheetRows}
    </Table>
    <AutoFilter x:Range="R4C1:R${registrations.length + 4}C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>4</SplitHorizontal>
      <TopRowBottomPane>4</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

function setFlash(req, flash) {
  req.session.flash = flash;
}

function getRedirectTarget(req) {
  return req.headers.referer || "/admin/inscripciones";
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateValue));
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long"
  }).format(new Date(dateValue));
}

function isAuthenticated(req, res, next) {
  if (!req.session.adminId) {
    setFlash(req, {
      type: "error",
      message: "Ingresa para acceder al panel administrativo."
    });
    return res.redirect("/admin");
  }

  next();
}

async function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  await fs.unlink(file.path).catch(() => {});
}

function getEventPresentation() {
  const configuredName = (process.env.EVENT_NAME || "Ruta del Acordeon 10 KM 2026")
    .trim()
    .replace(/\b10K\b/gi, "10 KM");
  const detectedYear = configuredName.match(/\b(20\d{2})\b/)?.[1] || "2026";
  const heroYear = (process.env.EVENT_YEAR || detectedYear).trim();
  let heroTitle = (process.env.EVENT_DISPLAY_NAME || configuredName)
    .replace(/^Carrera\s+Atletica\s+/i, "")
    .replace(new RegExp(`\\s*-?\\s*${heroYear}\\b`, "i"), "")
    .trim();

  if (!heroTitle) {
    heroTitle = "Ruta del Acordeon 10 KM";
  }

  return {
    eventName: configuredName,
    heroTitle,
    heroYear
  };
}

function renderHome(res, { errors = {}, values = {}, status = 200 } = {}) {
  const eventPresentation = getEventPresentation();

  return res.status(status).render("home", {
    errors,
    values,
    documentTypes: DOCUMENT_TYPES,
    sexOptions: SEX_OPTIONS,
    participationTypes: PARTICIPATION_TYPES,
    groupedCategories,
    shirtSizes: SHIRT_SIZES,
    eventName: eventPresentation.eventName,
    heroTitle: eventPresentation.heroTitle,
    heroYear: eventPresentation.heroYear,
    receiptMaxSizeMb,
    registrationsClosed,
    todayDate: new Date().toISOString().split("T")[0]
  });
}

function renderAdminLogin(res, { error = "", status = 200 } = {}) {
  const eventPresentation = getEventPresentation();

  return res.status(status).render("admin-login", {
    error,
    eventName: eventPresentation.eventName
  });
}

function uploadReceipt(req, res, next) {
  upload.single("paymentReceipt")(req, res, (error) => {
    if (error) {
      req.uploadError =
        error.code === "LIMIT_FILE_SIZE"
          ? `El comprobante no puede superar los ${receiptMaxSizeMb} MB.`
          : error.message;
    }
    next();
  });
}

export async function createApp() {
  const app = express();

  await initializeStore();

  if (uploadStorageMode === "disk") {
    await fs.mkdir(uploadDirectory, { recursive: true });
  }

  app.set("view engine", "ejs");
  app.set("views", path.join(appRoot, "views"));
  app.set("trust proxy", 1);

  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(appRoot, "public")));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "cambia-esta-clave-super-segura",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    res.locals.currentAdmin = req.session.adminUsername || null;
    delete req.session.flash;
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/", (_req, res) => renderHome(res));

  app.post(
    "/inscripcion",
    (req, res, next) => {
      if (!registrationsClosed) {
        return next();
      }

      setFlash(req, {
        type: "warning",
        message: "Las inscripciones están cerradas porque ya no hay cupos disponibles."
      });

      return res.redirect("/");
    },
    uploadReceipt,
    async (req, res) => {
    const { errors, values, registrationData } = validateRegistrationForm(
      req.body,
      req.file,
      req.uploadError
    );

    const duplicate =
      values.documentNumber && values.email
        ? await findRegistrationByDocumentOrEmail({
            documentNumber: values.documentNumber,
            email: values.email
          })
        : null;

    if (duplicate) {
      errors.documentNumber = "Ya existe una inscripción con este documento o correo.";
      errors.email = "Ya existe una inscripción con este documento o correo.";
    }

    if (Object.keys(errors).length > 0) {
      await removeUploadedFile(req.file);
      return renderHome(res, {
        errors,
        values,
        status: 422
      });
    }

    const storedFileName = buildStoredFileName(req.file.originalname);

    await createRegistration({
      ...registrationData,
      paymentReceipt: {
        storedName:
          uploadStorageMode === "database" ? storedFileName : req.file.filename || storedFileName,
        originalName: normalizeTextInput(req.file.originalname),
        mimeType: req.file.mimetype,
        size: req.file.size,
        ...(uploadStorageMode === "database"
          ? {
              data: req.file.buffer
            }
          : {
              path: req.file.path
            })
      }
    });

    setFlash(req, {
      type: "success",
      message: "Tu inscripción fue recibida correctamente. Quedó pendiente de validación."
    });

    return res.redirect("/");
    }
  );

  app.get("/admin", (req, res) => {
    if (req.session.adminId) {
      return res.redirect("/admin/inscripciones");
    }

    return renderAdminLogin(res);
  });

  app.post("/admin/login", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = req.body.password || "";

    const admin = await findAdminByUsername(username);

    if (!admin) {
      return renderAdminLogin(res, {
        error: "Usuario o contraseña incorrectos.",
        status: 401
      });
    }

    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

    if (!isValidPassword) {
      return renderAdminLogin(res, {
        error: "Usuario o contraseña incorrectos.",
        status: 401
      });
    }

    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;

    setFlash(req, {
      type: "success",
      message: "Acceso realizado correctamente."
    });

    return res.redirect("/admin/inscripciones");
  });

  app.post("/admin/logout", isAuthenticated, (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin");
    });
  });

  app.get("/admin/inscripciones", isAuthenticated, async (req, res) => {
    const filters = getAdminFilters(req);
    const [registrations, summary, approvedRegistrations] = await Promise.all([
      listFilteredRegistrations(filters),
      getRegistrationSummary(),
      listRegistrations({ status: "approved", query: "" })
    ]);

    res.render("admin-dashboard", {
      registrations,
      summary,
      approvedCategorySummary: buildApprovedCategorySummary(approvedRegistrations),
      categoryOptions,
      exportHref: buildExportHref(filters),
      filters,
      statusLabels: STATUS_LABELS,
      emailStatusLabels: EMAIL_STATUS_LABELS,
      formatDateTime,
      formatDate
    });
  });

  app.get("/admin/inscripciones/exportar", isAuthenticated, async (req, res) => {
    const filters = getAdminFilters(req);
    const registrations = await listFilteredRegistrations(filters);
    const exportedAt = new Date().toISOString().slice(0, 10);
    const workbook = buildExcelWorkbook(registrations, filters);

    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inscripciones-ruta-acordeon-${exportedAt}.xls"`
    );

    return res.send(workbook);
  });

  app.get("/admin/inscripciones/:id/comprobante", isAuthenticated, async (req, res) => {
    const registration = await getRegistrationById(req.params.id);

    if (!registration?.paymentReceipt) {
      setFlash(req, {
        type: "error",
        message: "No se encontró el comprobante adjunto para esta inscripción."
      });
      return res.redirect("/admin/inscripciones");
    }

    if (registration.paymentReceipt.data) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${registration.paymentReceipt.originalName}"`
      );
      return res.type(registration.paymentReceipt.mimeType).send(registration.paymentReceipt.data);
    }

    return res.sendFile(path.resolve(registration.paymentReceipt.path));
  });

  app.post("/admin/inscripciones/:id/estado", isAuthenticated, async (req, res) => {
    const registration = await getRegistrationById(req.params.id);

    if (!registration) {
      setFlash(req, {
        type: "error",
        message: "No se encontró la inscripción seleccionada."
      });
      return res.redirect("/admin/inscripciones");
    }

    const decision = req.body.decision;
    const adminNotes = (req.body.adminNotes || "").trim();

    if (decision === "approved") {
      const approvedRegistration = await updateRegistration(registration.id, {
        status: "approved",
        adminNotes,
        approvedAt: new Date().toISOString()
      });

      const emailResult = await sendApprovalEmail(approvedRegistration);

      await updateRegistration(registration.id, {
        approvalEmailStatus: emailResult.sent ? "sent" : "failed",
        approvalEmailSentAt: emailResult.sent ? new Date().toISOString() : null,
        lastEmailError: emailResult.sent ? "" : emailResult.error
      });

      setFlash(req, {
        type: emailResult.sent ? "success" : "warning",
        message: emailResult.sent
          ? "Inscripción aprobada y correo enviado correctamente."
          : `Inscripción aprobada, pero el correo no se pudo enviar: ${emailResult.error}`
      });
    } else if (decision === "rejected") {
      await updateRegistration(registration.id, {
        status: "rejected",
        adminNotes
      });

      setFlash(req, {
        type: "success",
        message: "La inscripción fue marcada como rechazada."
      });
    } else {
      await updateRegistration(registration.id, {
        status: "pending",
        adminNotes,
        approvedAt: null,
        approvalEmailStatus: "not_sent",
        approvalEmailSentAt: null,
        lastEmailError: ""
      });

      setFlash(req, {
        type: "success",
        message: "La inscripción volvió a estado pendiente."
      });
    }

    return res.redirect(getRedirectTarget(req));
  });

  app.post("/admin/inscripciones/:id/reenviar-correo", isAuthenticated, async (req, res) => {
    const registration = await getRegistrationById(req.params.id);

    if (!registration || registration.status !== "approved") {
      setFlash(req, {
        type: "error",
        message: "Solo puedes reenviar correos de inscripciones aprobadas."
      });
      return res.redirect("/admin/inscripciones");
    }

    const emailResult = await sendApprovalEmail(registration);

    await updateRegistration(registration.id, {
      approvalEmailStatus: emailResult.sent ? "sent" : "failed",
      approvalEmailSentAt: emailResult.sent ? new Date().toISOString() : registration.approvalEmailSentAt,
      lastEmailError: emailResult.sent ? "" : emailResult.error
    });

    setFlash(req, {
      type: emailResult.sent ? "success" : "warning",
      message: emailResult.sent
        ? "Correo de aprobación reenviado correctamente."
        : `No se pudo reenviar el correo: ${emailResult.error}`
    });

    return res.redirect(getRedirectTarget(req));
  });

  app.use((_req, res) => {
    res.status(404).render("not-found");
  });

  return app;
}
