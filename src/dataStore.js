import * as jsonStore from "./jsonStore.js";
import * as postgresStore from "./postgresStore.js";

const backend = process.env.DATABASE_URL ? postgresStore : jsonStore;

export const initializeStore = backend.initializeStore;
export const getUploadStorageMode = backend.getUploadStorageMode;
export const findAdminByUsername = backend.findAdminByUsername;
export const listRegistrations = backend.listRegistrations;
export const getRegistrationSummary = backend.getRegistrationSummary;
export const findRegistrationByDocumentOrEmail = backend.findRegistrationByDocumentOrEmail;
export const getRegistrationById = backend.getRegistrationById;
export const createRegistration = backend.createRegistration;
export const updateRegistration = backend.updateRegistration;
