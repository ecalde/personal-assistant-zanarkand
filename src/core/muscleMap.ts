/**
 * Canonical muscle ids and exercise-name → primary-muscle mapping.
 *
 * Isolation lifts map to one muscle (bicep curl → biceps). Compounds map to
 * the muscles they are programmed for as prime movers, never a whole focus
 * group (push/pull/legs). Unknown names return no highlights.
 */

import { normalizeExerciseName } from "./fitness";

export const MUSCLE_IDS = [
  "sternocleidomastoid",
  "trapezius_upper",
  "trapezius_middle",
  "trapezius_lower",
  "deltoid_anterior",
  "deltoid_lateral",
  "deltoid_posterior",
  "pectoralis_upper",
  "pectoralis_lower",
  "serratus_anterior",
  "biceps_brachii",
  "brachialis",
  "triceps_brachii",
  "brachioradialis",
  "forearm_flexors",
  "forearm_extensors",
  "latissimus_dorsi",
  "rhomboids",
  "infraspinatus",
  "teres_major",
  "erector_spinae",
  "rectus_abdominis",
  "obliques",
  "gluteus_maximus",
  "gluteus_medius",
  "hip_flexors",
  "adductors",
  "quadriceps",
  "hamstrings",
  "gastrocnemius",
  "soleus",
  "tibialis_anterior",
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export type MuscleView = "front" | "back";

export type MuscleDefinition = {
  id: MuscleId;
  label: string;
  views: MuscleView[];
};

export const MUSCLE_CATALOG: MuscleDefinition[] = [
  { id: "sternocleidomastoid", label: "Sternocleidomastoid", views: ["front"] },
  { id: "trapezius_upper", label: "Upper trapezius", views: ["front", "back"] },
  { id: "trapezius_middle", label: "Middle trapezius", views: ["back"] },
  { id: "trapezius_lower", label: "Lower trapezius", views: ["back"] },
  { id: "deltoid_anterior", label: "Anterior deltoid", views: ["front"] },
  { id: "deltoid_lateral", label: "Lateral deltoid", views: ["front", "back"] },
  { id: "deltoid_posterior", label: "Posterior deltoid", views: ["back"] },
  { id: "pectoralis_upper", label: "Upper pectoralis", views: ["front"] },
  { id: "pectoralis_lower", label: "Lower pectoralis", views: ["front"] },
  { id: "serratus_anterior", label: "Serratus anterior", views: ["front"] },
  { id: "biceps_brachii", label: "Biceps brachii", views: ["front"] },
  { id: "brachialis", label: "Brachialis", views: ["front"] },
  { id: "triceps_brachii", label: "Triceps brachii", views: ["back"] },
  { id: "brachioradialis", label: "Brachioradialis", views: ["front"] },
  { id: "forearm_flexors", label: "Forearm flexors", views: ["front"] },
  { id: "forearm_extensors", label: "Forearm extensors", views: ["back"] },
  { id: "latissimus_dorsi", label: "Latissimus dorsi", views: ["back"] },
  { id: "rhomboids", label: "Rhomboids", views: ["back"] },
  { id: "infraspinatus", label: "Infraspinatus", views: ["back"] },
  { id: "teres_major", label: "Teres major", views: ["back"] },
  { id: "erector_spinae", label: "Erector spinae", views: ["back"] },
  { id: "rectus_abdominis", label: "Rectus abdominis", views: ["front"] },
  { id: "obliques", label: "External obliques", views: ["front"] },
  { id: "gluteus_maximus", label: "Gluteus maximus", views: ["back"] },
  { id: "gluteus_medius", label: "Gluteus medius", views: ["back"] },
  { id: "hip_flexors", label: "Hip flexors", views: ["front"] },
  { id: "adductors", label: "Adductors", views: ["front"] },
  { id: "quadriceps", label: "Quadriceps", views: ["front"] },
  { id: "hamstrings", label: "Hamstrings", views: ["back"] },
  { id: "gastrocnemius", label: "Gastrocnemius", views: ["front", "back"] },
  { id: "soleus", label: "Soleus", views: ["back"] },
  { id: "tibialis_anterior", label: "Tibialis anterior", views: ["front"] },
];

const LABEL_BY_ID: Record<MuscleId, string> = Object.fromEntries(
  MUSCLE_CATALOG.map((entry) => [entry.id, entry.label])
) as Record<MuscleId, string>;

const ID_SET = new Set<string>(MUSCLE_IDS);

export function isMuscleId(value: string): value is MuscleId {
  return ID_SET.has(value);
}

export function muscleLabel(id: MuscleId): string {
  return LABEL_BY_ID[id];
}

const EQUIPMENT_PREFIX =
  /^(db|bb|ez|kb|mw|dumbbells?|barbells?|cables?|machines?|smith( machine)?|kettlebells?|banded|resistance bands?|ez[- ]bar)\s+/;

/** Strip equipment prefixes and trailing set schemes so catalog rules can match. */
export function canonicalExerciseName(name: string): string {
  let normalized = normalizeExerciseName(name);
  for (let i = 0; i < 3; i += 1) {
    const next = normalized.replace(EQUIPMENT_PREFIX, "").trim();
    if (next === normalized) break;
    normalized = next;
  }
  return normalized
    .replace(/\s+\d+(\s*[x×/-]\s*\d+)?(\s*reps?)?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

type MuscleRule = {
  pattern: RegExp;
  muscles: MuscleId[];
};

/**
 * First matching rule wins. More specific names (incline curl, leg curl) must
 * appear before generic tokens (curl, press).
 */
const MUSCLE_RULES: MuscleRule[] = [
  { pattern: /\bleg curls?\b|\bhamstring curls?\b|\blying curls?\b|\bseated leg curls?\b/, muscles: ["hamstrings"] },
  { pattern: /\b(preacher|concentration|spider|bayesian|incline)\b.*\bcurls?\b/, muscles: ["biceps_brachii"] },
  { pattern: /\bhammer curls?\b|\bcross[- ]body curls?\b/, muscles: ["brachialis", "brachioradialis"] },
  { pattern: /\breverse curls?\b/, muscles: ["brachioradialis"] },
  { pattern: /\bwrist curls?\b|\bforearm curls?\b/, muscles: ["forearm_flexors"] },
  { pattern: /\bwrist extensions?\b|\breverse wrist\b/, muscles: ["forearm_extensors"] },
  { pattern: /\b(bicep|biceps)\b|\bcurls?\b/, muscles: ["biceps_brachii"] },

  { pattern: /\b(tricep|triceps)\b|\bskull\s*crush|\boverhead extensions?\b|\bpushdowns?\b|\bkickbacks?\b/, muscles: ["triceps_brachii"] },
  { pattern: /\bclose[- ]grip (bench|press)\b/, muscles: ["triceps_brachii"] },

  { pattern: /\bincline\b.*\b(bench|press|fly|flye|chest)\b|\bupper (chest|pec)/, muscles: ["pectoralis_upper"] },
  { pattern: /\bdecline\b.*\b(bench|press|fly|flye|chest)\b|\blower (chest|pec)/, muscles: ["pectoralis_lower"] },
  { pattern: /\b(bench press|chest press|chest fly|pec deck|cable cross|crossovers?)\b/, muscles: ["pectoralis_upper", "pectoralis_lower"] },
  { pattern: /\b(push[- ]?ups?|dips?)\b/, muscles: ["pectoralis_lower", "triceps_brachii"] },
  { pattern: /\b(pec|chest)\b/, muscles: ["pectoralis_upper", "pectoralis_lower"] },

  { pattern: /\b(lateral|side) raises?\b/, muscles: ["deltoid_lateral"] },
  { pattern: /\bfront raises?\b/, muscles: ["deltoid_anterior"] },
  { pattern: /\brear delt|\bface pulls?\b|\breverse fly|\bbent[- ]over fly/, muscles: ["deltoid_posterior"] },
  { pattern: /\b(overhead|shoulder|military|arnold) press\b|\bohp\b/, muscles: ["deltoid_anterior", "deltoid_lateral"] },
  { pattern: /\bupright rows?\b/, muscles: ["deltoid_lateral", "trapezius_upper"] },

  { pattern: /\bshrugs?\b/, muscles: ["trapezius_upper"] },
  { pattern: /\by[- ]raises?\b|\bfarmer/, muscles: ["trapezius_upper"] },

  { pattern: /\bpull[- ]?ups?\b|\bchin[- ]?ups?\b|\blat pulldowns?\b|\bpulldowns?\b/, muscles: ["latissimus_dorsi"] },
  { pattern: /\b(barbell|pendlay|cable|seated|chest[- ]supported|meadows)?\s*rows?\b|\bseal rows?\b/, muscles: ["latissimus_dorsi"] },
  { pattern: /\b(straight[- ]arm|pullovers?)\b/, muscles: ["latissimus_dorsi"] },
  { pattern: /\brhomboid|\bscapular retrac/, muscles: ["rhomboids"] },
  { pattern: /\bexternal rotat|\bcuff\b/, muscles: ["infraspinatus"] },

  { pattern: /\bromanian deadlifts?\b|\brdls?\b|\bgood mornings?\b|\bstiff[- ]leg/, muscles: ["hamstrings", "gluteus_maximus"] },
  { pattern: /\bdeadlifts?\b|\bracks? pulls?\b/, muscles: ["hamstrings", "gluteus_maximus", "erector_spinae"] },
  { pattern: /\bback extensions?\b|\bhyperextensions?\b|\bsupermans?\b/, muscles: ["erector_spinae"] },

  { pattern: /\bhip thrusts?\b|\bglute bridges?\b|\bglute kickbacks?\b/, muscles: ["gluteus_maximus"] },
  { pattern: /\b(hip|cable) abductions?\b|\bclamshells?\b/, muscles: ["gluteus_medius"] },
  { pattern: /\b(hip|cable) adductions?\b|\badductor\b/, muscles: ["adductors"] },
  { pattern: /\bleg raises?\b|\bhanging (knee|leg)\b|\bhip flex/, muscles: ["hip_flexors"] },

  { pattern: /\bleg extensions?\b/, muscles: ["quadriceps"] },
  { pattern: /\b(front|goblet|hack|split) squats?\b|\bbulgarian\b/, muscles: ["quadriceps"] },
  { pattern: /\bsquats?\b|\bleg press\b|\blunges?\b|\bstep[- ]?ups?\b|\bsissy\b/, muscles: ["quadriceps", "gluteus_maximus"] },

  { pattern: /\bseated calf|\bsoleus\b/, muscles: ["soleus"] },
  { pattern: /\b(standing )?calf raises?\b|\bcalves\b|\bgastroc/, muscles: ["gastrocnemius"] },
  { pattern: /\btibialis\b|\btoe raises?\b/, muscles: ["tibialis_anterior"] },

  { pattern: /\b(cable )?woodchops?\b|\brussian twists?\b|\bside planks?\b|\bsuitcase\b/, muscles: ["obliques"] },
  { pattern: /\bcrunches?\b|\bsit[- ]?ups?\b|\bab wheel\b|\bplanks?\b|\bdead bugs?\b|\bv[- ]ups?\b/, muscles: ["rectus_abdominis"] },
  { pattern: /\bserratus\b|\bscap push/, muscles: ["serratus_anterior"] },
  { pattern: /\bneck (curl|flex|harness)\b/, muscles: ["sternocleidomastoid"] },
];

const UNIQUE_MUSCLE_IDS: MuscleId[] = [...MUSCLE_IDS];

export function musclesForExerciseName(name: string): MuscleId[] {
  const canonical = canonicalExerciseName(name);
  if (!canonical) return [];

  for (const rule of MUSCLE_RULES) {
    if (rule.pattern.test(canonical)) {
      return [...rule.muscles];
    }
  }
  return [];
}

export function musclesForExerciseNames(names: readonly string[]): MuscleId[] {
  const seen = new Set<MuscleId>();
  for (const name of names) {
    for (const id of musclesForExerciseName(name)) {
      seen.add(id);
    }
  }
  return UNIQUE_MUSCLE_IDS.filter((id) => seen.has(id));
}

export function collectUnmappedExerciseNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const unmapped: string[] = [];
  for (const name of names) {
    const canonical = canonicalExerciseName(name);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    if (musclesForExerciseName(name).length === 0) {
      unmapped.push(name.trim().replace(/\s+/g, " "));
    }
  }
  return unmapped;
}
