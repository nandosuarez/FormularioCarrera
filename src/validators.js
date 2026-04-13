import path from "node:path";
import {
  ALLOWED_RECEIPT_EXTENSIONS,
  ALLOWED_RECEIPT_MIME_TYPES,
  CATEGORIES,
  DOCUMENT_TYPES,
  PARTICIPATION_TYPES,
  SEX_OPTIONS,
  SHIRT_SIZES
} from "./constants.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function calculateAge(birthDateString) {
  const birthDate = new Date(birthDateString);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

export function normalizeTextInput(value) {
  const text = (value || "").toString().trim();

  if (!text) {
    return "";
  }

  return /Ã.|Â|ðŸ/.test(text) ? Buffer.from(text, "latin1").toString("utf8") : text;
}

function cleanString(value) {
  const normalized = normalizeTextInput(value);
  return /[ÃÂâð]/.test(normalized)
    ? Buffer.from(normalized, "latin1").toString("utf8")
    : normalized;
}

export function validateRegistrationForm(body, file, uploadError) {
  const errors = {};

  const fullName = cleanString(body.fullName);
  const documentTypeValue = cleanString(body.documentType);
  const documentNumber = cleanString(body.documentNumber);
  const birthDate = cleanString(body.birthDate);
  const sexValue = cleanString(body.sex);
  const phone = cleanString(body.phone);
  const email = cleanString(body.email).toLowerCase();
  const address = cleanString(body.address);
  const city = cleanString(body.city);
  const participationTypeValue = cleanString(body.participationType);
  const categoryValue = cleanString(body.category);
  const bloodType = cleanString(body.bloodType).toUpperCase();
  const insurance = cleanString(body.insurance);
  const medicalConditionValue = cleanString(body.medicalCondition).toLowerCase();
  const medicalCondition = medicalConditionValue === "si";
  const medicalDetails = cleanString(body.medicalDetails);
  const priorRaceValue = cleanString(body.priorRace).toLowerCase();
  const priorRace = priorRaceValue === "si";
  const emergencyName = cleanString(body.emergencyName);
  const emergencyRelationship = cleanString(body.emergencyRelationship);
  const emergencyPhone = cleanString(body.emergencyPhone);
  const shirtSize = cleanString(body.shirtSize);
  const termsAccepted = body.termsAccepted === "on";
  const selectedDocumentType = DOCUMENT_TYPES.find((item) => item.value === documentTypeValue);
  const selectedSex = SEX_OPTIONS.find((item) => item.value === sexValue);
  const selectedParticipationType = PARTICIPATION_TYPES.find(
    (item) => item.value === participationTypeValue
  );

  if (!fullName) {
    errors.fullName = "Ingresa tus nombres y apellidos completos.";
  }

  if (!selectedDocumentType) {
    errors.documentType = "Selecciona un tipo de documento válido.";
  }

  if (!documentNumber) {
    errors.documentNumber = "Ingresa tu número de documento.";
  }

  if (!birthDate) {
    errors.birthDate = "Selecciona la fecha de nacimiento.";
  }

  const age = calculateAge(birthDate);

  if (age === null || age < 0 || age > 120) {
    errors.birthDate = "La fecha de nacimiento no es válida.";
  }

  if (!selectedSex) {
    errors.sex = "Selecciona tu sexo.";
  }

  if (!phone) {
    errors.phone = "Ingresa un número de celular.";
  }

  if (!emailPattern.test(email)) {
    errors.email = "Ingresa un correo electrónico válido.";
  }

  if (!address) {
    errors.address = "Ingresa tu dirección de residencia.";
  }

  if (!city) {
    errors.city = "Ingresa tu ciudad o municipio.";
  }

  if (!selectedParticipationType) {
    errors.participationType = "Selecciona el tipo de participación.";
  }

  const selectedCategory = CATEGORIES.find((item) => item.value === categoryValue);

  if (!selectedCategory) {
    errors.category = "Selecciona una categoría válida.";
  } else {
    if (selectedCategory.participationType !== participationTypeValue) {
      errors.category = "La categoría no coincide con el tipo de participación.";
    }

    if (selectedCategory.sex !== sexValue) {
      errors.category = "La categoría no coincide con la rama seleccionada.";
    }

    if (selectedCategory.minAge && age < selectedCategory.minAge) {
      errors.category = "La categoría seleccionada no corresponde a tu edad.";
    }

    if (selectedCategory.maxAge && age > selectedCategory.maxAge) {
      errors.category = "La categoría seleccionada no corresponde a tu edad.";
    }
  }

  if (!bloodType) {
    errors.bloodType = "Ingresa tu grupo sanguíneo.";
  }

  if (!insurance) {
    errors.insurance = "Ingresa tu EPS o seguro médico.";
  }

  if (!["si", "no"].includes(medicalConditionValue)) {
    errors.medicalCondition = "Indica si presentas una condición médica.";
  }

  if (medicalCondition && !medicalDetails) {
    errors.medicalDetails = "Describe la condición médica reportada.";
  }

  if (!["si", "no"].includes(priorRaceValue)) {
    errors.priorRace = "Indica si has participado en carreras anteriormente.";
  }

  if (!emergencyName) {
    errors.emergencyName = "Ingresa el nombre del contacto de emergencia.";
  }

  if (!emergencyRelationship) {
    errors.emergencyRelationship = "Ingresa el parentesco del contacto de emergencia.";
  }

  if (!emergencyPhone) {
    errors.emergencyPhone = "Ingresa el número del contacto de emergencia.";
  }

  if (!SHIRT_SIZES.includes(shirtSize)) {
    errors.shirtSize = "Selecciona una talla de camiseta.";
  }

  if (!termsAccepted) {
    errors.termsAccepted = "Debes aceptar los términos y condiciones.";
  }

  if (uploadError) {
    errors.paymentReceipt = uploadError;
  } else if (!file) {
    errors.paymentReceipt = "Adjunta el comprobante de pago.";
  } else {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (!ALLOWED_RECEIPT_EXTENSIONS.includes(extension)) {
      errors.paymentReceipt = "El comprobante debe ser PDF, JPG o PNG.";
    }

    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(file.mimetype)) {
      errors.paymentReceipt = "El tipo de archivo del comprobante no es válido.";
    }
  }

  return {
    errors,
    values: {
      fullName,
      documentType: documentTypeValue,
      documentNumber,
      birthDate,
      age: age ?? "",
      sex: sexValue,
      phone,
      email,
      address,
      city,
      participationType: participationTypeValue,
      category: categoryValue,
      bloodType,
      insurance,
      medicalCondition: medicalCondition ? "si" : "no",
      medicalDetails,
      priorRace: priorRace ? "si" : "no",
      emergencyName,
      emergencyRelationship,
      emergencyPhone,
      shirtSize,
      termsAccepted
    },
    registrationData: {
      fullName,
      documentType: selectedDocumentType?.label || documentTypeValue,
      documentNumber,
      birthDate,
      age: age ?? "",
      sex: selectedSex?.label || sexValue,
      phone,
      email,
      address,
      city,
      participationType: selectedParticipationType?.title || participationTypeValue,
      category: selectedCategory?.label || categoryValue,
      bloodType,
      insurance,
      medicalCondition: medicalCondition ? "Sí" : "No",
      medicalDetails,
      priorRace: priorRace ? "Sí" : "No",
      emergencyName,
      emergencyRelationship,
      emergencyPhone,
      shirtSize,
      termsAccepted
    }
  };
}
