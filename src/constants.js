export const DOCUMENT_TYPES = [
  { value: "cedula_ciudadania", label: "Cédula de ciudadanía" },
  { value: "tarjeta_identidad", label: "Tarjeta de identidad" },
  { value: "cedula_extranjeria", label: "Cédula de extranjería" },
  { value: "pasaporte", label: "Pasaporte" }
];

export const SEX_OPTIONS = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" }
];

export const PARTICIPATION_TYPES = [
  {
    value: "competitiva",
    title: "Competitiva",
    description: "Nivel nacional"
  },
  {
    value: "recreativa",
    title: "Recreativa",
    description: "Solo villanueveros"
  }
];

export const CATEGORIES = [
  {
    value: "elite_masculino",
    label: "Élite Masculino",
    participationType: "competitiva",
    sex: "masculino"
  },
  {
    value: "elite_femenino",
    label: "Élite Femenino",
    participationType: "competitiva",
    sex: "femenino"
  },
  {
    value: "abierta_masculino",
    label: "Abierta Masculino",
    participationType: "competitiva",
    sex: "masculino"
  },
  {
    value: "abierta_femenino",
    label: "Abierta Femenino",
    participationType: "competitiva",
    sex: "femenino"
  },
  {
    value: "mayores_masculino",
    label: "Mayores Masculino (40 a 49 años)",
    participationType: "competitiva",
    sex: "masculino",
    minAge: 40,
    maxAge: 49
  },
  {
    value: "mayores_femenino",
    label: "Mayores Femenino (40 a 49 años)",
    participationType: "competitiva",
    sex: "femenino",
    minAge: 40,
    maxAge: 49
  },
  {
    value: "master_masculino",
    label: "Máster Masculino (50 a 59 años)",
    participationType: "competitiva",
    sex: "masculino",
    minAge: 50,
    maxAge: 59
  },
  {
    value: "master_femenino",
    label: "Máster Femenino (50 a 59 años)",
    participationType: "competitiva",
    sex: "femenino",
    minAge: 50,
    maxAge: 59
  },
  {
    value: "senior_masculino",
    label: "Senior Masculino (60 años en adelante)",
    participationType: "competitiva",
    sex: "masculino",
    minAge: 60
  },
  {
    value: "senior_femenino",
    label: "Senior Femenino (60 años en adelante)",
    participationType: "competitiva",
    sex: "femenino",
    minAge: 60
  },
  {
    value: "recreativa_masculino",
    label: "Recreativa Masculino (Solo Villanueveros)",
    participationType: "recreativa",
    sex: "masculino"
  },
  {
    value: "recreativa_femenino",
    label: "Recreativa Femenino (Solo Villanueveros)",
    participationType: "recreativa",
    sex: "femenino"
  }
];

export const SHIRT_SIZES = ["S", "M", "L", "XL"];

export const YES_NO_OPTIONS = ["Sí", "No"];

export const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado"
};

export const EMAIL_STATUS_LABELS = {
  not_sent: "Correo pendiente",
  sent: "Correo enviado",
  failed: "Error al enviar"
};

export const ALLOWED_RECEIPT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
export const ALLOWED_RECEIPT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];
