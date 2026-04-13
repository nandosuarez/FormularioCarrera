const birthDateInput = document.querySelector('input[name="birthDate"]');
const ageInput = document.querySelector('input[name="age"]');
const participationInputs = document.querySelectorAll('input[name="participationType"]');
const sexInputs = document.querySelectorAll('input[name="sex"]');
const categoryCards = document.querySelectorAll(".category-card");
const medicalInputs = document.querySelectorAll('input[name="medicalCondition"]');
const medicalDetailsField = document.querySelector('[data-conditional="medicalDetails"]');
const medicalDetailsTextarea = document.querySelector('textarea[name="medicalDetails"]');

function calculateAge(dateValue) {
  if (!dateValue) return "";

  const birthDate = new Date(dateValue);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : "";
}

function syncAge() {
  if (!birthDateInput || !ageInput) return;
  ageInput.value = calculateAge(birthDateInput.value);
}

function syncCategories() {
  const selectedParticipation = document.querySelector('input[name="participationType"]:checked')?.value;
  const selectedSex = document.querySelector('input[name="sex"]:checked')?.value;

  categoryCards.forEach((card) => {
    const input = card.querySelector("input");
    const matchesParticipation =
      !selectedParticipation || card.dataset.participationType === selectedParticipation;
    const matchesSex = !selectedSex || card.dataset.sex === selectedSex;
    const isVisible = matchesParticipation && matchesSex;

    card.classList.toggle("is-hidden", !isVisible);

    if (!isVisible) {
      input.checked = false;
    }
  });
}

function syncMedicalDetails() {
  const hasMedicalCondition = document.querySelector('input[name="medicalCondition"]:checked')?.value === "si";

  if (!medicalDetailsField || !medicalDetailsTextarea) return;

  medicalDetailsField.classList.toggle("is-hidden", !hasMedicalCondition);
  medicalDetailsTextarea.required = hasMedicalCondition;

  if (!hasMedicalCondition) {
    medicalDetailsTextarea.value = "";
  }
}

birthDateInput?.addEventListener("input", syncAge);
participationInputs.forEach((input) => input.addEventListener("change", syncCategories));
sexInputs.forEach((input) => input.addEventListener("change", syncCategories));
medicalInputs.forEach((input) => input.addEventListener("change", syncMedicalDetails));

syncAge();
syncCategories();
syncMedicalDetails();
