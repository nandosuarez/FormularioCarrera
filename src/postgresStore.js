import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { normalizeTextInput } from "./validators.js";

const legacyDataFile = path.join(process.cwd(), "data", "db.json");

let pool;
let initializedPromise;

function repairText(value) {
  const normalized = normalizeTextInput(value);
  return /[ÃÂâð]/.test(normalized)
    ? Buffer.from(normalized, "latin1").toString("utf8")
    : normalized;
}

async function getPool() {
  if (pool) {
    return pool;
  }

  if (process.env.DATABASE_URL?.startsWith("pgmem:")) {
    const { newDb } = await import("pg-mem");
    const memoryDb = newDb();
    const adapter = memoryDb.adapters.createPg();
    pool = new adapter.Pool();
    return pool;
  }

  const pg = await import("pg");
  const ssl =
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: false
        }
      : undefined;

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl
  });

  return pool;
}

function mapAdminRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}

function mapRegistrationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    documentType: row.document_type,
    documentNumber: row.document_number,
    birthDate: row.birth_date,
    age: row.age,
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    participationType: row.participation_type,
    category: row.category,
    bloodType: row.blood_type,
    insurance: row.insurance,
    medicalCondition: row.medical_condition,
    medicalDetails: row.medical_details,
    priorRace: row.prior_race,
    emergencyName: row.emergency_name,
    emergencyRelationship: row.emergency_relationship,
    emergencyPhone: row.emergency_phone,
    shirtSize: row.shirt_size,
    termsAccepted: row.terms_accepted,
    paymentReceipt: {
      storedName: row.payment_receipt_stored_name,
      originalName: row.payment_receipt_original_name,
      mimeType: row.payment_receipt_mime_type,
      size: Number(row.payment_receipt_size),
      data: row.payment_receipt_data
    },
    status: row.status,
    adminNotes: row.admin_notes,
    approvalEmailStatus: row.approval_email_status,
    lastEmailError: row.last_email_error,
    approvalEmailSentAt:
      row.approval_email_sent_at?.toISOString?.() || row.approval_email_sent_at,
    approvedAt: row.approved_at?.toISOString?.() || row.approved_at,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}

async function ensureSchema() {
  const db = await getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL UNIQUE,
      birth_date DATE NOT NULL,
      age INTEGER NOT NULL,
      sex TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      participation_type TEXT NOT NULL,
      category TEXT NOT NULL,
      blood_type TEXT NOT NULL,
      insurance TEXT NOT NULL,
      medical_condition TEXT NOT NULL,
      medical_details TEXT NOT NULL DEFAULT '',
      prior_race TEXT NOT NULL,
      emergency_name TEXT NOT NULL,
      emergency_relationship TEXT NOT NULL,
      emergency_phone TEXT NOT NULL,
      shirt_size TEXT NOT NULL,
      terms_accepted BOOLEAN NOT NULL,
      payment_receipt_stored_name TEXT NOT NULL,
      payment_receipt_original_name TEXT NOT NULL,
      payment_receipt_mime_type TEXT NOT NULL,
      payment_receipt_size BIGINT NOT NULL,
      payment_receipt_data BYTEA NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_notes TEXT NOT NULL DEFAULT '',
      approval_email_status TEXT NOT NULL DEFAULT 'not_sent',
      last_email_error TEXT NOT NULL DEFAULT '',
      approval_email_sent_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(
    `CREATE INDEX IF NOT EXISTS registrations_status_idx ON registrations (status);`
  );
}

async function seedAdmin() {
  const db = await getPool();
  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_PASSWORD || "CambiaEsto123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  await db.query(
    `
      INSERT INTO admins (id, username, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (username)
      DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at
    `,
    [crypto.randomUUID(), username, passwordHash, now]
  );
}

async function importLegacyJsonIfNeeded() {
  if (process.env.DATABASE_URL?.startsWith("pgmem:")) {
    return;
  }

  const db = await getPool();
  const countResult = await db.query(`SELECT COUNT(*)::INT AS count FROM registrations`);

  if (countResult.rows[0].count > 0) {
    return;
  }

  try {
    const raw = await fs.readFile(legacyDataFile, "utf8");
    const parsed = JSON.parse(raw);
    const registrations = Array.isArray(parsed.registrations) ? parsed.registrations : [];

    for (const registration of registrations) {
      if (!registration?.id || !registration?.paymentReceipt?.originalName) {
        continue;
      }

      let receiptBuffer = Buffer.from("");

      if (registration.paymentReceipt.path) {
        receiptBuffer = await fs.readFile(registration.paymentReceipt.path).catch(() => Buffer.from(""));
      }

      await db.query(
        `
          INSERT INTO registrations (
            id, full_name, document_type, document_number, birth_date, age, sex, phone, email,
            address, city, participation_type, category, blood_type, insurance, medical_condition,
            medical_details, prior_race, emergency_name, emergency_relationship, emergency_phone,
            shirt_size, terms_accepted, payment_receipt_stored_name, payment_receipt_original_name,
            payment_receipt_mime_type, payment_receipt_size, payment_receipt_data, status, admin_notes,
            approval_email_status, last_email_error, approval_email_sent_at, approved_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24, $25,
            $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          registration.id,
          repairText(registration.fullName),
          repairText(registration.documentType),
          repairText(registration.documentNumber),
          registration.birthDate,
          Number(registration.age),
          repairText(registration.sex),
          repairText(registration.phone),
          repairText(registration.email),
          repairText(registration.address),
          repairText(registration.city),
          repairText(registration.participationType),
          repairText(registration.category),
          repairText(registration.bloodType),
          repairText(registration.insurance),
          repairText(registration.medicalCondition),
          repairText(registration.medicalDetails || ""),
          repairText(registration.priorRace),
          repairText(registration.emergencyName),
          repairText(registration.emergencyRelationship),
          repairText(registration.emergencyPhone),
          repairText(registration.shirtSize),
          Boolean(registration.termsAccepted),
          repairText(registration.paymentReceipt.storedName || `${registration.id}.bin`),
          repairText(registration.paymentReceipt.originalName),
          repairText(registration.paymentReceipt.mimeType || "application/octet-stream"),
          Number(registration.paymentReceipt.size || receiptBuffer.length),
          receiptBuffer,
          repairText(registration.status || "pending"),
          repairText(registration.adminNotes || ""),
          repairText(registration.approvalEmailStatus || "not_sent"),
          repairText(registration.lastEmailError || ""),
          registration.approvalEmailSentAt,
          registration.approvedAt,
          registration.createdAt || new Date().toISOString(),
          registration.updatedAt || new Date().toISOString()
        ]
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function initializeStore() {
  if (!initializedPromise) {
    initializedPromise = (async () => {
      await ensureSchema();
      await seedAdmin();
      await importLegacyJsonIfNeeded();
    })();
  }

  return initializedPromise;
}

export function getUploadStorageMode() {
  return "database";
}

export async function findAdminByUsername(username) {
  const db = await getPool();
  const result = await db.query(`SELECT * FROM admins WHERE username = $1 LIMIT 1`, [username]);
  return mapAdminRow(result.rows[0]);
}

export async function listRegistrations({ status = "all", query = "" } = {}) {
  const db = await getPool();
  const values = [];
  const where = [];

  if (status !== "all") {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  if (query.trim()) {
    values.push(`%${query.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(full_name) LIKE $${values.length} OR LOWER(document_number) LIKE $${values.length} OR LOWER(email) LIKE $${values.length})`
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await db.query(
    `
      SELECT *
      FROM registrations
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values
  );

  return result.rows.map(mapRegistrationRow);
}

export async function getRegistrationSummary() {
  const db = await getPool();
  const result = await db.query(`
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
      COUNT(*) FILTER (WHERE status = 'approved')::INT AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected
    FROM registrations
  `);

  return result.rows[0];
}

export async function findRegistrationByDocumentOrEmail({ documentNumber, email }) {
  const db = await getPool();
  const result = await db.query(
    `
      SELECT *
      FROM registrations
      WHERE LOWER(document_number) = LOWER($1) OR LOWER(email) = LOWER($2)
      LIMIT 1
    `,
    [documentNumber.trim(), email.trim()]
  );

  return mapRegistrationRow(result.rows[0]);
}

export async function getRegistrationById(id) {
  const db = await getPool();
  const result = await db.query(`SELECT * FROM registrations WHERE id = $1 LIMIT 1`, [id]);
  return mapRegistrationRow(result.rows[0]);
}

export async function createRegistration(payload) {
  const db = await getPool();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const receipt = payload.paymentReceipt;

  const result = await db.query(
    `
      INSERT INTO registrations (
        id, full_name, document_type, document_number, birth_date, age, sex, phone, email,
        address, city, participation_type, category, blood_type, insurance, medical_condition,
        medical_details, prior_race, emergency_name, emergency_relationship, emergency_phone,
        shirt_size, terms_accepted, payment_receipt_stored_name, payment_receipt_original_name,
        payment_receipt_mime_type, payment_receipt_size, payment_receipt_data, status, admin_notes,
        approval_email_status, last_email_error, approval_email_sent_at, approved_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25,
        $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $35
      )
      RETURNING *
    `,
    [
      id,
      payload.fullName,
      payload.documentType,
      payload.documentNumber,
      payload.birthDate,
      Number(payload.age),
      payload.sex,
      payload.phone,
      payload.email,
      payload.address,
      payload.city,
      payload.participationType,
      payload.category,
      payload.bloodType,
      payload.insurance,
      payload.medicalCondition,
      payload.medicalDetails || "",
      payload.priorRace,
      payload.emergencyName,
      payload.emergencyRelationship,
      payload.emergencyPhone,
      payload.shirtSize,
      Boolean(payload.termsAccepted),
      receipt.storedName,
      receipt.originalName,
      receipt.mimeType,
      Number(receipt.size),
      receipt.data,
      "pending",
      "",
      "not_sent",
      "",
      null,
      null,
      now
    ]
  );

  return mapRegistrationRow(result.rows[0]);
}

const updateColumnMap = {
  status: "status",
  adminNotes: "admin_notes",
  approvalEmailStatus: "approval_email_status",
  lastEmailError: "last_email_error",
  approvalEmailSentAt: "approval_email_sent_at",
  approvedAt: "approved_at"
};

export async function updateRegistration(id, updates) {
  const db = await getPool();
  const assignments = [];
  const values = [];

  for (const [key, column] of Object.entries(updateColumnMap)) {
    if (Object.hasOwn(updates, key)) {
      values.push(updates[key]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  assignments.push(`updated_at = NOW()`);
  values.push(id);

  const result = await db.query(
    `
      UPDATE registrations
      SET ${assignments.join(", ")}
      WHERE id = $${values.length}
      RETURNING *
    `,
    values
  );

  return mapRegistrationRow(result.rows[0]);
}
