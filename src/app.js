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
    fileSize: 5 * 1024 * 1024
  }
});

const groupedCategories = [
  {
    title: "Competitiva",
    categories: CATEGORIES.filter((item) => item.participationType === "competitiva")
  },
  {
    title: "Recreativa",
    categories: CATEGORIES.filter((item) => item.participationType === "recreativa")
  }
];

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

function renderHome(res, { errors = {}, values = {}, status = 200 } = {}) {
  return res.status(status).render("home", {
    errors,
    values,
    documentTypes: DOCUMENT_TYPES,
    sexOptions: SEX_OPTIONS,
    participationTypes: PARTICIPATION_TYPES,
    groupedCategories,
    shirtSizes: SHIRT_SIZES,
    eventName: process.env.EVENT_NAME || "Carrera Atlética Ruta del Acordeón 10K - 2026",
    todayDate: new Date().toISOString().split("T")[0]
  });
}

function renderAdminLogin(res, { error = "", status = 200 } = {}) {
  return res.status(status).render("admin-login", {
    error,
    eventName: process.env.EVENT_NAME || "Ruta del Acordeón 10K - 2026"
  });
}

function uploadReceipt(req, res, next) {
  upload.single("paymentReceipt")(req, res, (error) => {
    if (error) {
      req.uploadError =
        error.code === "LIMIT_FILE_SIZE"
          ? "El comprobante no puede superar los 5 MB."
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

  app.post("/inscripcion", uploadReceipt, async (req, res) => {
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
  });

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
    const status = req.query.status || "all";
    const query = (req.query.q || "").trim();
    const [registrations, summary] = await Promise.all([
      listRegistrations({ status, query }),
      getRegistrationSummary()
    ]);

    res.render("admin-dashboard", {
      registrations,
      summary,
      filters: { status, query },
      statusLabels: STATUS_LABELS,
      emailStatusLabels: EMAIL_STATUS_LABELS,
      formatDateTime,
      formatDate
    });
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
