import type { Person } from "../../core/model";

export type PersonFormState = {
  name: string;
  nickname: string;
  birthdayMonth: string;
  birthdayDay: string;
  birthYear: string;
  relationship: string;
  likes: string;
  dislikes: string;
  giftIdeas: string;
  notes: string;
  lastContactDate: string;
  contactCadenceDays: string;
};

export function emptyPersonFormState(): PersonFormState {
  return {
    name: "",
    nickname: "",
    birthdayMonth: "",
    birthdayDay: "",
    birthYear: "",
    relationship: "",
    likes: "",
    dislikes: "",
    giftIdeas: "",
    notes: "",
    lastContactDate: "",
    contactCadenceDays: "",
  };
}

export function birthdayMonthDayFromForm(form: PersonFormState): string | undefined {
  const month = form.birthdayMonth.trim();
  const day = form.birthdayDay.trim();
  if (!month || !day) return undefined;
  return `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function personFormFromPerson(person: Person): PersonFormState {
  const [month = "", day = ""] = person.birthdayMonthDay?.split("-") ?? [];
  return {
    name: person.name,
    nickname: person.nickname ?? "",
    birthdayMonth: month,
    birthdayDay: day,
    birthYear: person.birthYear !== undefined ? String(person.birthYear) : "",
    relationship: person.relationship ?? "",
    likes: person.likes ?? "",
    dislikes: person.dislikes ?? "",
    giftIdeas: person.giftIdeas ?? "",
    notes: person.notes ?? "",
    lastContactDate: person.lastContactDate ?? "",
    contactCadenceDays:
      person.contactCadenceDays !== undefined ? String(person.contactCadenceDays) : "",
  };
}

export function validatePersonForm(form: PersonFormState): string | null {
  const name = form.name.trim();
  if (!name) return "Name is required.";

  const month = form.birthdayMonth.trim();
  const day = form.birthdayDay.trim();
  if ((month && !day) || (!month && day)) {
    return "Enter both birthday month and day, or leave both empty.";
  }

  const yearRaw = form.birthYear.trim();
  if (yearRaw) {
    const parsed = Number(yearRaw);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > currentYear) {
      return `Year of birth must be between 1900 and ${currentYear}.`;
    }
  }

  const cadenceRaw = form.contactCadenceDays.trim();
  if (cadenceRaw) {
    const parsed = Number(cadenceRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return "Contact cadence must be a positive whole number.";
    }
  }

  return null;
}

export function personPayloadFromForm(
  form: PersonFormState
): Omit<Person, "id" | "createdAtIso" | "updatedAtIso"> {
  const cadenceRaw = form.contactCadenceDays.trim();
  let contactCadenceDays: number | undefined;
  if (cadenceRaw) {
    contactCadenceDays = Number(cadenceRaw);
  }

  const yearRaw = form.birthYear.trim();
  const birthYear = yearRaw ? Number(yearRaw) : undefined;

  return {
    name: form.name.trim(),
    nickname: form.nickname.trim() || undefined,
    birthdayMonthDay: birthdayMonthDayFromForm(form),
    birthYear,
    relationship: form.relationship.trim() || undefined,
    likes: form.likes.trim() || undefined,
    dislikes: form.dislikes.trim() || undefined,
    giftIdeas: form.giftIdeas.trim() || undefined,
    notes: form.notes.trim() || undefined,
    lastContactDate: form.lastContactDate.trim() || undefined,
    contactCadenceDays,
  };
}
