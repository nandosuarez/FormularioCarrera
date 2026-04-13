import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { normalizeTextInput } from "./validators.js";

const dataDirectory = path.join(process.cwd(), "data");
const dataFile = path.join(dataDirectory, "db.json");

const defaultData = {
  admins: [],
  registrations: []
};

const db = {
  data: null
};

let initialized = false;
let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);

    return {
      admins: Array.isArray(parsed.admins) ? parsed.admins : [],
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    await fs.writeFile(dataFile, `${JSON.stringify(defaultData, null, 2)}\n`, "utf8");
    return structuredClone(defaultData);
  }
}

async function persist() {
  const snapshot = `${JSON.stringify(db.data, null, 2)}\n`;
  writeQueue = writeQueue.then(() => fs.writeFile(dataFile, snapshot, "utf8"));
  await writeQueue;
}

function repairText(value) {
  if (typeof value === "string") {
    const normalized = normalizeTextInput(value);
    return /[ÃÂâð]/.test(normalized)
      ? Buffer.from(normalized, "latin1").toString("utf8")
      : normalized;
  }

  if (Array.isArray(value)) {
    return value.map(repairText);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, repairText(entryValue)])
    );
  }

  return value;
}

async function repairStoredText() {
  const snapshot = JSON.stringify(db.data);
  db.data = repairText(db.data);

  if (JSON.stringify(db.data) !== snapshot) {
    await persist();
  }
}

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_PASSWORD || "CambiaEsto123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const existingAdmin = db.data.admins.find((admin) => admin.username === username);

  if (existingAdmin) {
    existingAdmin.passwordHash = passwordHash;
    existingAdmin.updatedAt = new Date().toISOString();
  } else {
    db.data.admins.push({
      id: crypto.randomUUID(),
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  await persist();
}

export async function initializeStore() {
  if (initialized) {
    return;
  }

  db.data = await ensureStore();
  await repairStoredText();
  await seedAdmin();
  initialized = true;
}

export function getUploadStorageMode() {
  return "disk";
}

export async function findAdminByUsername(username) {
  return db.data.admins.find((admin) => admin.username === username) || null;
}

export async function listRegistrations({ status = "all", query = "" } = {}) {
  const queryValue = query.trim().toLowerCase();

  return [...db.data.registrations]
    .filter((registration) => {
      const matchesStatus = status === "all" || registration.status === status;
      const matchesQuery =
        !queryValue ||
        registration.fullName.toLowerCase().includes(queryValue) ||
        registration.documentNumber.toLowerCase().includes(queryValue) ||
        registration.email.toLowerCase().includes(queryValue);

      return matchesStatus && matchesQuery;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getRegistrationSummary() {
  const summary = {
    total: db.data.registrations.length,
    pending: 0,
    approved: 0,
    rejected: 0
  };

  for (const registration of db.data.registrations) {
    summary[registration.status] += 1;
  }

  return summary;
}

export async function findRegistrationByDocumentOrEmail({ documentNumber, email }) {
  const normalizedDocument = documentNumber.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  return (
    db.data.registrations.find(
      (registration) =>
        registration.documentNumber.toLowerCase() === normalizedDocument ||
        registration.email.toLowerCase() === normalizedEmail
    ) || null
  );
}

export async function getRegistrationById(id) {
  return db.data.registrations.find((registration) => registration.id === id) || null;
}

export async function createRegistration(payload) {
  const now = new Date().toISOString();

  const record = {
    id: crypto.randomUUID(),
    ...payload,
    status: "pending",
    adminNotes: "",
    approvalEmailStatus: "not_sent",
    lastEmailError: "",
    approvalEmailSentAt: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now
  };

  db.data.registrations.push(record);
  await persist();

  return record;
}

export async function updateRegistration(id, updates) {
  const registration = db.data.registrations.find((item) => item.id === id);

  if (!registration) {
    return null;
  }

  Object.assign(registration, updates, {
    updatedAt: new Date().toISOString()
  });

  await persist();
  return registration;
}
