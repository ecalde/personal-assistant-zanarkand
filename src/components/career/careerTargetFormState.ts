import type { CareerTarget } from "../../core/model";

export type CareerTargetFormState = {
  roleTitle: string;
  company: string;
  notes: string;
  requiredSkillIds: string[];
  requiredSkillsText: string;
};

export function emptyCareerTargetFormState(): CareerTargetFormState {
  return {
    roleTitle: "",
    company: "",
    notes: "",
    requiredSkillIds: [],
    requiredSkillsText: "",
  };
}

export function careerTargetFormFromTarget(target: CareerTarget): CareerTargetFormState {
  return {
    roleTitle: target.roleTitle,
    company: target.company ?? "",
    notes: target.notes ?? "",
    requiredSkillIds: [...target.requiredSkillIds],
    requiredSkillsText: target.requiredSkillsText ?? "",
  };
}

export function validateCareerTargetForm(form: CareerTargetFormState): string | null {
  if (!form.roleTitle.trim()) return "Dream role title is required.";
  return null;
}

export function careerTargetPayloadFromForm(
  form: CareerTargetFormState
): Omit<CareerTarget, "id" | "updatedAtIso"> {
  return {
    roleTitle: form.roleTitle.trim(),
    company: form.company.trim() || undefined,
    notes: form.notes.trim() || undefined,
    requiredSkillIds: [...form.requiredSkillIds],
    requiredSkillsText: form.requiredSkillsText.trim() || undefined,
  };
}
