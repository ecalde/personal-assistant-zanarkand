/**
 * Training-muscle catalog with canonical IDs + synonym resolution.
 *
 * Exercises store only canonical `targetMuscleIds` (never free-text synonyms),
 * so "gastrocnemius" and "calf muscle" always collapse to one ID for coverage
 * charts. Group entries (e.g. quads, calves) are first-class IDs with `covers`
 * listing the specific muscles a future body chart should tint.
 */

export type MuscleRegion =
  | "neck"
  | "shoulders"
  | "chest"
  | "back"
  | "arms"
  | "forearms"
  | "core"
  | "hips"
  | "thighs"
  | "calves"
  | "full_body";

export type MuscleKind = "muscle" | "group";

export type MuscleDefinition = {
  id: string;
  name: string;
  kind: MuscleKind;
  region: MuscleRegion;
  /** Informal / anatomical synonyms that resolve to this id. */
  aliases: string[];
  /**
   * For group entries: specific muscle ids a body chart should expand to.
   * Empty for single muscles.
   */
  covers: string[];
  /** Stable SVG / chart region keys for future visualization. */
  chartKeys: string[];
};

export type MuscleSuggestion = {
  id: string;
  name: string;
  kind: MuscleKind;
  region: MuscleRegion;
  /** Alias or name fragment that matched the query. */
  matchedVia: string;
};

const MUSCLES: MuscleDefinition[] = [
  // —— Neck ——
  {
    id: "sternocleidomastoid",
    name: "Sternocleidomastoid",
    kind: "muscle",
    region: "neck",
    aliases: ["scm", "sternocleidomastoid muscle", "neck flexor"],
    covers: [],
    chartKeys: ["neck_scm"],
  },
  {
    id: "levator_scapulae",
    name: "Levator scapulae",
    kind: "muscle",
    region: "neck",
    aliases: ["levator", "levator scapula"],
    covers: [],
    chartKeys: ["neck_levator"],
  },
  {
    id: "deep_neck_flexors",
    name: "Deep neck flexors",
    kind: "group",
    region: "neck",
    aliases: ["neck flexors", "deep cervical flexors", "longus colli"],
    covers: [],
    chartKeys: ["neck_deep_flexors"],
  },
  {
    id: "neck",
    name: "Neck",
    kind: "group",
    region: "neck",
    aliases: ["neck muscles", "cervical"],
    covers: ["sternocleidomastoid", "levator_scapulae", "deep_neck_flexors"],
    chartKeys: ["neck"],
  },

  // —— Shoulders ——
  {
    id: "anterior_deltoid",
    name: "Anterior deltoid",
    kind: "muscle",
    region: "shoulders",
    aliases: [
      "front deltoid",
      "front delt",
      "front delts",
      "anterior delt",
      "anterior delts",
      "front shoulder",
    ],
    covers: [],
    chartKeys: ["deltoid_anterior"],
  },
  {
    id: "lateral_deltoid",
    name: "Lateral deltoid",
    kind: "muscle",
    region: "shoulders",
    aliases: [
      "side deltoid",
      "side delt",
      "side delts",
      "medial deltoid",
      "medial delt",
      "middle deltoid",
      "middle delt",
      "lateral delt",
      "lateral delts",
    ],
    covers: [],
    chartKeys: ["deltoid_lateral"],
  },
  {
    id: "posterior_deltoid",
    name: "Posterior deltoid",
    kind: "muscle",
    region: "shoulders",
    aliases: [
      "rear deltoid",
      "rear delt",
      "rear delts",
      "back delt",
      "back delts",
      "posterior delt",
      "posterior delts",
    ],
    covers: [],
    chartKeys: ["deltoid_posterior"],
  },
  {
    id: "deltoids",
    name: "Deltoids",
    kind: "group",
    region: "shoulders",
    aliases: ["delts", "delt", "shoulders", "shoulder", "shoulder muscles"],
    covers: ["anterior_deltoid", "lateral_deltoid", "posterior_deltoid"],
    chartKeys: ["deltoid_anterior", "deltoid_lateral", "deltoid_posterior"],
  },
  {
    id: "supraspinatus",
    name: "Supraspinatus",
    kind: "muscle",
    region: "shoulders",
    aliases: [],
    covers: [],
    chartKeys: ["rotator_cuff"],
  },
  {
    id: "infraspinatus",
    name: "Infraspinatus",
    kind: "muscle",
    region: "shoulders",
    aliases: [],
    covers: [],
    chartKeys: ["rotator_cuff"],
  },
  {
    id: "teres_minor",
    name: "Teres minor",
    kind: "muscle",
    region: "shoulders",
    aliases: [],
    covers: [],
    chartKeys: ["rotator_cuff"],
  },
  {
    id: "subscapularis",
    name: "Subscapularis",
    kind: "muscle",
    region: "shoulders",
    aliases: ["subscap"],
    covers: [],
    chartKeys: ["rotator_cuff"],
  },
  {
    id: "rotator_cuff",
    name: "Rotator cuff",
    kind: "group",
    region: "shoulders",
    aliases: ["cuff", "rotator cuffs", "shoulder cuff"],
    covers: ["supraspinatus", "infraspinatus", "teres_minor", "subscapularis"],
    chartKeys: ["rotator_cuff"],
  },

  // —— Chest ——
  {
    id: "pectoralis_major",
    name: "Pectoralis major",
    kind: "muscle",
    region: "chest",
    aliases: [
      "pec major",
      "pecs major",
      "pectoral major",
      "upper chest",
      "lower chest",
      "mid chest",
    ],
    covers: [],
    chartKeys: ["pectoralis_major"],
  },
  {
    id: "pectoralis_minor",
    name: "Pectoralis minor",
    kind: "muscle",
    region: "chest",
    aliases: ["pec minor", "pectoral minor"],
    covers: [],
    chartKeys: ["pectoralis_minor"],
  },
  {
    id: "chest",
    name: "Chest",
    kind: "group",
    region: "chest",
    aliases: ["pecs", "pec", "pectorals", "pectoral muscles", "chest muscles"],
    covers: ["pectoralis_major", "pectoralis_minor"],
    chartKeys: ["pectoralis_major", "pectoralis_minor"],
  },
  {
    id: "serratus_anterior",
    name: "Serratus anterior",
    kind: "muscle",
    region: "chest",
    aliases: ["serratus", "boxer's muscle"],
    covers: [],
    chartKeys: ["serratus_anterior"],
  },

  // —— Back ——
  {
    id: "latissimus_dorsi",
    name: "Latissimus dorsi",
    kind: "muscle",
    region: "back",
    aliases: ["lats", "lat", "latissimus", "lat dorsi"],
    covers: [],
    chartKeys: ["latissimus_dorsi"],
  },
  {
    id: "upper_trapezius",
    name: "Upper trapezius",
    kind: "muscle",
    region: "back",
    aliases: ["upper traps", "upper trap"],
    covers: [],
    chartKeys: ["trapezius_upper"],
  },
  {
    id: "middle_trapezius",
    name: "Middle trapezius",
    kind: "muscle",
    region: "back",
    aliases: ["mid traps", "mid trap", "middle traps", "middle trap"],
    covers: [],
    chartKeys: ["trapezius_middle"],
  },
  {
    id: "lower_trapezius",
    name: "Lower trapezius",
    kind: "muscle",
    region: "back",
    aliases: ["lower traps", "lower trap"],
    covers: [],
    chartKeys: ["trapezius_lower"],
  },
  {
    id: "trapezius",
    name: "Trapezius",
    kind: "group",
    region: "back",
    aliases: ["traps", "trap", "trapezius muscles"],
    covers: ["upper_trapezius", "middle_trapezius", "lower_trapezius"],
    chartKeys: ["trapezius_upper", "trapezius_middle", "trapezius_lower"],
  },
  {
    id: "rhomboids",
    name: "Rhomboids",
    kind: "group",
    region: "back",
    aliases: ["rhomboid", "rhomboid major", "rhomboid minor"],
    covers: [],
    chartKeys: ["rhomboids"],
  },
  {
    id: "teres_major",
    name: "Teres major",
    kind: "muscle",
    region: "back",
    aliases: [],
    covers: [],
    chartKeys: ["teres_major"],
  },
  {
    id: "erector_spinae",
    name: "Erector spinae",
    kind: "group",
    region: "back",
    aliases: [
      "spinal erectors",
      "erectors",
      "lower back",
      "low back",
      "lumbar erectors",
      "back extensors",
    ],
    covers: [],
    chartKeys: ["erector_spinae"],
  },
  {
    id: "multifidus",
    name: "Multifidus",
    kind: "muscle",
    region: "back",
    aliases: ["multifidi"],
    covers: [],
    chartKeys: ["multifidus"],
  },
  {
    id: "quadratus_lumborum",
    name: "Quadratus lumborum",
    kind: "muscle",
    region: "back",
    aliases: ["ql", "quadratus"],
    covers: [],
    chartKeys: ["quadratus_lumborum"],
  },
  {
    id: "back",
    name: "Back",
    kind: "group",
    region: "back",
    aliases: ["back muscles", "upper back", "posterior chain back"],
    covers: [
      "latissimus_dorsi",
      "trapezius",
      "rhomboids",
      "teres_major",
      "erector_spinae",
    ],
    chartKeys: [
      "latissimus_dorsi",
      "trapezius_upper",
      "trapezius_middle",
      "trapezius_lower",
      "rhomboids",
      "erector_spinae",
    ],
  },

  // —— Arms ——
  {
    id: "biceps_brachii",
    name: "Biceps brachii",
    kind: "muscle",
    region: "arms",
    aliases: ["bicep brachii", "long head biceps", "short head biceps"],
    covers: [],
    chartKeys: ["biceps_brachii"],
  },
  {
    id: "brachialis",
    name: "Brachialis",
    kind: "muscle",
    region: "arms",
    aliases: [],
    covers: [],
    chartKeys: ["brachialis"],
  },
  {
    id: "biceps",
    name: "Biceps",
    kind: "group",
    region: "arms",
    aliases: ["bicep", "bis", "arm flexors"],
    covers: ["biceps_brachii", "brachialis"],
    chartKeys: ["biceps_brachii", "brachialis"],
  },
  {
    id: "triceps_brachii",
    name: "Triceps brachii",
    kind: "muscle",
    region: "arms",
    aliases: [
      "tricep brachii",
      "long head triceps",
      "lateral head triceps",
      "medial head triceps",
    ],
    covers: [],
    chartKeys: ["triceps_brachii"],
  },
  {
    id: "triceps",
    name: "Triceps",
    kind: "group",
    region: "arms",
    aliases: ["tricep", "tris", "arm extensors"],
    covers: ["triceps_brachii"],
    chartKeys: ["triceps_brachii"],
  },

  // —— Forearms ——
  {
    id: "brachioradialis",
    name: "Brachioradialis",
    kind: "muscle",
    region: "forearms",
    aliases: [],
    covers: [],
    chartKeys: ["brachioradialis"],
  },
  {
    id: "wrist_flexors",
    name: "Wrist flexors",
    kind: "group",
    region: "forearms",
    aliases: [
      "forearm flexors",
      "flexor carpi",
      "flexor carpi radialis",
      "flexor carpi ulnaris",
      "palmaris longus",
    ],
    covers: [],
    chartKeys: ["wrist_flexors"],
  },
  {
    id: "wrist_extensors",
    name: "Wrist extensors",
    kind: "group",
    region: "forearms",
    aliases: [
      "forearm extensors",
      "extensor carpi",
      "extensor carpi radialis",
      "extensor carpi ulnaris",
    ],
    covers: [],
    chartKeys: ["wrist_extensors"],
  },
  {
    id: "finger_flexors",
    name: "Finger flexors",
    kind: "group",
    region: "forearms",
    aliases: ["grip muscles", "flexor digitorum", "grip"],
    covers: [],
    chartKeys: ["finger_flexors"],
  },
  {
    id: "forearms",
    name: "Forearms",
    kind: "group",
    region: "forearms",
    aliases: ["forearm", "forearm muscles", "lower arms"],
    covers: ["brachioradialis", "wrist_flexors", "wrist_extensors", "finger_flexors"],
    chartKeys: ["brachioradialis", "wrist_flexors", "wrist_extensors", "finger_flexors"],
  },

  // —— Core ——
  {
    id: "rectus_abdominis",
    name: "Rectus abdominis",
    kind: "muscle",
    region: "core",
    aliases: ["six pack", "six-pack", "abs muscle", "upper abs", "lower abs"],
    covers: [],
    chartKeys: ["rectus_abdominis"],
  },
  {
    id: "external_obliques",
    name: "External obliques",
    kind: "muscle",
    region: "core",
    aliases: ["external oblique"],
    covers: [],
    chartKeys: ["obliques"],
  },
  {
    id: "internal_obliques",
    name: "Internal obliques",
    kind: "muscle",
    region: "core",
    aliases: ["internal oblique"],
    covers: [],
    chartKeys: ["obliques"],
  },
  {
    id: "obliques",
    name: "Obliques",
    kind: "group",
    region: "core",
    aliases: ["side abs", "oblique muscles"],
    covers: ["external_obliques", "internal_obliques"],
    chartKeys: ["obliques"],
  },
  {
    id: "transverse_abdominis",
    name: "Transverse abdominis",
    kind: "muscle",
    region: "core",
    aliases: ["tva", "transversus abdominis", "deep abs", "transverse abs"],
    covers: [],
    chartKeys: ["transverse_abdominis"],
  },
  {
    id: "abs",
    name: "Abs",
    kind: "group",
    region: "core",
    aliases: ["abdominals", "abdomen", "core abs", "stomach"],
    covers: [
      "rectus_abdominis",
      "external_obliques",
      "internal_obliques",
      "transverse_abdominis",
    ],
    chartKeys: ["rectus_abdominis", "obliques", "transverse_abdominis"],
  },
  {
    id: "core",
    name: "Core",
    kind: "group",
    region: "core",
    aliases: ["core muscles", "trunk", "midsection"],
    covers: [
      "rectus_abdominis",
      "external_obliques",
      "internal_obliques",
      "transverse_abdominis",
      "erector_spinae",
      "multifidus",
      "quadratus_lumborum",
    ],
    chartKeys: [
      "rectus_abdominis",
      "obliques",
      "transverse_abdominis",
      "erector_spinae",
      "multifidus",
      "quadratus_lumborum",
    ],
  },

  // —— Hips / glutes ——
  {
    id: "gluteus_maximus",
    name: "Gluteus maximus",
    kind: "muscle",
    region: "hips",
    aliases: ["glute max", "glut max", "maximus"],
    covers: [],
    chartKeys: ["gluteus_maximus"],
  },
  {
    id: "gluteus_medius",
    name: "Gluteus medius",
    kind: "muscle",
    region: "hips",
    aliases: ["glute med", "glut med", "medius"],
    covers: [],
    chartKeys: ["gluteus_medius"],
  },
  {
    id: "gluteus_minimus",
    name: "Gluteus minimus",
    kind: "muscle",
    region: "hips",
    aliases: ["glute min", "glut min", "minimus"],
    covers: [],
    chartKeys: ["gluteus_minimus"],
  },
  {
    id: "glutes",
    name: "Glutes",
    kind: "group",
    region: "hips",
    aliases: ["glute", "gluteal", "gluteals", "butt", "buttocks", "booty"],
    covers: ["gluteus_maximus", "gluteus_medius", "gluteus_minimus"],
    chartKeys: ["gluteus_maximus", "gluteus_medius", "gluteus_minimus"],
  },
  {
    id: "iliopsoas",
    name: "Iliopsoas",
    kind: "group",
    region: "hips",
    aliases: ["psoas", "iliacus", "psoas major"],
    covers: [],
    chartKeys: ["hip_flexors"],
  },
  {
    id: "tensor_fasciae_latae",
    name: "Tensor fasciae latae",
    kind: "muscle",
    region: "hips",
    aliases: ["tfl", "tensor fascia lata", "tensor fasciae lata"],
    covers: [],
    chartKeys: ["tensor_fasciae_latae"],
  },
  {
    id: "hip_flexors",
    name: "Hip flexors",
    kind: "group",
    region: "hips",
    aliases: ["hip flexor", "hip flex"],
    covers: ["iliopsoas", "tensor_fasciae_latae", "rectus_femoris"],
    chartKeys: ["hip_flexors", "tensor_fasciae_latae", "rectus_femoris"],
  },
  {
    id: "adductor_longus",
    name: "Adductor longus",
    kind: "muscle",
    region: "hips",
    aliases: [],
    covers: [],
    chartKeys: ["adductors"],
  },
  {
    id: "adductor_magnus",
    name: "Adductor magnus",
    kind: "muscle",
    region: "hips",
    aliases: [],
    covers: [],
    chartKeys: ["adductors"],
  },
  {
    id: "adductor_brevis",
    name: "Adductor brevis",
    kind: "muscle",
    region: "hips",
    aliases: [],
    covers: [],
    chartKeys: ["adductors"],
  },
  {
    id: "gracilis",
    name: "Gracilis",
    kind: "muscle",
    region: "hips",
    aliases: [],
    covers: [],
    chartKeys: ["adductors"],
  },
  {
    id: "adductors",
    name: "Adductors",
    kind: "group",
    region: "hips",
    aliases: ["inner thighs", "inner thigh", "hip adductors", "groin"],
    covers: ["adductor_longus", "adductor_magnus", "adductor_brevis", "gracilis"],
    chartKeys: ["adductors"],
  },
  {
    id: "abductors",
    name: "Abductors",
    kind: "group",
    region: "hips",
    aliases: ["hip abductors", "outer hips", "outer thigh"],
    covers: ["gluteus_medius", "gluteus_minimus", "tensor_fasciae_latae"],
    chartKeys: ["gluteus_medius", "gluteus_minimus", "tensor_fasciae_latae"],
  },
  {
    id: "piriformis",
    name: "Piriformis",
    kind: "muscle",
    region: "hips",
    aliases: [],
    covers: [],
    chartKeys: ["hip_external_rotators"],
  },
  {
    id: "hip_external_rotators",
    name: "Hip external rotators",
    kind: "group",
    region: "hips",
    aliases: ["deep six", "external rotators", "hip rotators"],
    covers: ["piriformis"],
    chartKeys: ["hip_external_rotators"],
  },

  // —— Thighs ——
  {
    id: "rectus_femoris",
    name: "Rectus femoris",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["rectus_femoris"],
  },
  {
    id: "vastus_lateralis",
    name: "Vastus lateralis",
    kind: "muscle",
    region: "thighs",
    aliases: ["outer quad", "lateral quad"],
    covers: [],
    chartKeys: ["vastus_lateralis"],
  },
  {
    id: "vastus_medialis",
    name: "Vastus medialis",
    kind: "muscle",
    region: "thighs",
    aliases: ["vmo", "inner quad", "teardrop", "vastus medialis oblique"],
    covers: [],
    chartKeys: ["vastus_medialis"],
  },
  {
    id: "vastus_intermedius",
    name: "Vastus intermedius",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["vastus_intermedius"],
  },
  {
    id: "quadriceps",
    name: "Quadriceps",
    kind: "group",
    region: "thighs",
    aliases: ["quads", "quad", "quadricep", "thighs front", "front thighs"],
    covers: [
      "rectus_femoris",
      "vastus_lateralis",
      "vastus_medialis",
      "vastus_intermedius",
    ],
    chartKeys: [
      "rectus_femoris",
      "vastus_lateralis",
      "vastus_medialis",
      "vastus_intermedius",
    ],
  },
  {
    id: "biceps_femoris",
    name: "Biceps femoris",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["biceps_femoris"],
  },
  {
    id: "semitendinosus",
    name: "Semitendinosus",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["semitendinosus"],
  },
  {
    id: "semimembranosus",
    name: "Semimembranosus",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["semimembranosus"],
  },
  {
    id: "hamstrings",
    name: "Hamstrings",
    kind: "group",
    region: "thighs",
    aliases: ["hams", "hamstring", "hammies", "rear thighs", "back of thighs"],
    covers: ["biceps_femoris", "semitendinosus", "semimembranosus"],
    chartKeys: ["biceps_femoris", "semitendinosus", "semimembranosus"],
  },
  {
    id: "sartorius",
    name: "Sartorius",
    kind: "muscle",
    region: "thighs",
    aliases: [],
    covers: [],
    chartKeys: ["sartorius"],
  },

  // —— Calves / lower leg ——
  {
    id: "gastrocnemius",
    name: "Gastrocnemius",
    kind: "muscle",
    region: "calves",
    aliases: [
      "gastroc",
      "calf muscle",
      "calf",
      "outer calf",
      "medial gastroc",
      "lateral gastroc",
    ],
    covers: [],
    chartKeys: ["gastrocnemius"],
  },
  {
    id: "soleus",
    name: "Soleus",
    kind: "muscle",
    region: "calves",
    aliases: ["soleus muscle", "deep calf"],
    covers: [],
    chartKeys: ["soleus"],
  },
  {
    id: "calves",
    name: "Calves",
    kind: "group",
    region: "calves",
    aliases: ["calf muscles", "lower legs", "triceps surae"],
    covers: ["gastrocnemius", "soleus"],
    chartKeys: ["gastrocnemius", "soleus"],
  },
  {
    id: "tibialis_anterior",
    name: "Tibialis anterior",
    kind: "muscle",
    region: "calves",
    aliases: ["shin", "shins", "anterior tibialis", "tib anterior"],
    covers: [],
    chartKeys: ["tibialis_anterior"],
  },
  {
    id: "tibialis_posterior",
    name: "Tibialis posterior",
    kind: "muscle",
    region: "calves",
    aliases: ["posterior tibialis", "tib posterior"],
    covers: [],
    chartKeys: ["tibialis_posterior"],
  },
  {
    id: "peroneals",
    name: "Peroneals",
    kind: "group",
    region: "calves",
    aliases: [
      "fibularis",
      "fibularis longus",
      "fibularis brevis",
      "peroneus",
      "peroneus longus",
      "peroneus brevis",
    ],
    covers: [],
    chartKeys: ["peroneals"],
  },

  // —— Broad training groups ——
  {
    id: "legs",
    name: "Legs",
    kind: "group",
    region: "thighs",
    aliases: ["lower body", "leg muscles"],
    covers: [
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "adductors",
      "hip_flexors",
    ],
    chartKeys: [
      "rectus_femoris",
      "vastus_lateralis",
      "vastus_medialis",
      "vastus_intermedius",
      "biceps_femoris",
      "semitendinosus",
      "semimembranosus",
      "gluteus_maximus",
      "gluteus_medius",
      "gluteus_minimus",
      "gastrocnemius",
      "soleus",
      "adductors",
    ],
  },
  {
    id: "posterior_chain",
    name: "Posterior chain",
    kind: "group",
    region: "full_body",
    aliases: ["back chain", "posterior"],
    covers: ["hamstrings", "glutes", "erector_spinae", "calves"],
    chartKeys: [
      "biceps_femoris",
      "semitendinosus",
      "semimembranosus",
      "gluteus_maximus",
      "gluteus_medius",
      "gluteus_minimus",
      "erector_spinae",
      "gastrocnemius",
      "soleus",
    ],
  },
];

const byId = new Map<string, MuscleDefinition>();
const aliasToId = new Map<string, string>();

function normalizeMuscleQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

for (const muscle of MUSCLES) {
  if (byId.has(muscle.id)) {
    throw new Error(`Duplicate muscle id: ${muscle.id}`);
  }
  byId.set(muscle.id, muscle);

  const terms = [muscle.name, muscle.id.replace(/_/g, " "), ...muscle.aliases];
  for (const term of terms) {
    const key = normalizeMuscleQuery(term);
    if (!key) continue;
    const existing = aliasToId.get(key);
    if (existing && existing !== muscle.id) {
      throw new Error(
        `Ambiguous muscle alias "${term}" maps to both ${existing} and ${muscle.id}`
      );
    }
    aliasToId.set(key, muscle.id);
  }
}

export function listMuscles(): MuscleDefinition[] {
  return MUSCLES.slice();
}

export function getMuscleById(id: string): MuscleDefinition | undefined {
  return byId.get(id);
}

export function isMuscleId(value: string): boolean {
  return byId.has(value);
}

/** Resolve free text (synonym or name) to a canonical muscle id. */
export function resolveMuscleId(raw: string): string | undefined {
  const key = normalizeMuscleQuery(raw);
  if (!key) return undefined;
  return aliasToId.get(key);
}

export function formatMuscleName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export function formatMuscleList(ids: string[] | undefined): string {
  if (!ids || ids.length === 0) return "";
  return ids.map(formatMuscleName).join(", ");
}

/**
 * Expand group ids into chart keys (and keep specific-muscle chart keys).
 * Safe to call repeatedly; order is stable and duplicates are removed.
 */
export function expandMuscleIdsForChart(ids: Iterable<string>): string[] {
  const keys = new Set<string>();
  const queue = [...ids];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const def = byId.get(id);
    if (!def) continue;
    for (const key of def.chartKeys) keys.add(key);
    for (const child of def.covers) {
      if (!seen.has(child)) queue.push(child);
    }
  }

  return [...keys];
}

/** Unique canonical muscle ids referenced by plan/session exercises. */
export function collectTargetMuscleIds(
  exercises: Array<{ targetMuscleIds?: string[] }>
): string[] {
  const ids = new Set<string>();
  for (const entry of exercises) {
    for (const id of entry.targetMuscleIds ?? []) {
      if (byId.has(id)) ids.add(id);
    }
  }
  return [...ids];
}

export function collectPlanMuscleCoverage(
  plans: Array<{ exercises: Array<{ targetMuscleIds?: string[] }> }>
): string[] {
  const ids = new Set<string>();
  for (const plan of plans) {
    for (const id of collectTargetMuscleIds(plan.exercises)) ids.add(id);
  }
  return [...ids];
}

export function collectSessionMuscleCoverage(
  sessions: Array<{ exercises: Array<{ targetMuscleIds?: string[] }> }>
): string[] {
  const ids = new Set<string>();
  for (const session of sessions) {
    for (const id of collectTargetMuscleIds(session.exercises)) ids.add(id);
  }
  return [...ids];
}

function scoreSuggestion(
  query: string,
  candidate: string,
  kind: "name" | "alias" | "id"
): number {
  if (!candidate.startsWith(query) && !candidate.includes(query) && candidate !== query) {
    return 0;
  }

  let score = 0;
  if (candidate === query) score = kind === "name" ? 100 : kind === "id" ? 95 : 90;
  else if (candidate.startsWith(query)) score = kind === "name" ? 80 : kind === "id" ? 75 : 70;
  else score = kind === "name" ? 50 : kind === "id" ? 45 : 40;

  // Prefer tighter matches ("quad" → quads/quadriceps over quadratus_lumborum).
  const coverage = query.length / Math.max(candidate.length, 1);
  score += coverage * 20;

  // Slight preference for short gym nicknames as aliases.
  if (kind === "alias" && candidate.length <= 6 && candidate.startsWith(query)) {
    score += 8;
  }

  return score;
}

/**
 * Typeahead suggestions. Matches display names, ids, and aliases; returns
 * canonical catalog rows (so picking "calf muscle" yields gastrocnemius).
 */
export function suggestMuscles(
  query: string,
  options?: { limit?: number; excludeIds?: Iterable<string> }
): MuscleSuggestion[] {
  const limit = options?.limit ?? 8;
  const excluded = new Set(options?.excludeIds ?? []);
  const normalized = normalizeMuscleQuery(query);

  if (!normalized) {
    return MUSCLES.filter((muscle) => !excluded.has(muscle.id))
      .slice(0, limit)
      .map((muscle) => ({
        id: muscle.id,
        name: muscle.name,
        kind: muscle.kind,
        region: muscle.region,
        matchedVia: muscle.name,
      }));
  }

  const scored = new Map<string, { suggestion: MuscleSuggestion; score: number }>();

  for (const muscle of MUSCLES) {
    if (excluded.has(muscle.id)) continue;

    let bestScore = 0;
    let matchedVia = muscle.name;

    const nameKey = normalizeMuscleQuery(muscle.name);
    const nameScore = scoreSuggestion(normalized, nameKey, "name");
    if (nameScore > bestScore) {
      bestScore = nameScore;
      matchedVia = muscle.name;
    }

    const idKey = normalizeMuscleQuery(muscle.id.replace(/_/g, " "));
    const idScore = scoreSuggestion(normalized, idKey, "id");
    if (idScore > bestScore) {
      bestScore = idScore;
      matchedVia = muscle.name;
    }

    for (const alias of muscle.aliases) {
      const aliasKey = normalizeMuscleQuery(alias);
      const aliasScore = scoreSuggestion(normalized, aliasKey, "alias");
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        matchedVia = alias;
      }
    }

    if (bestScore <= 0) continue;

    const existing = scored.get(muscle.id);
    if (!existing || bestScore > existing.score) {
      scored.set(muscle.id, {
        score: bestScore,
        suggestion: {
          id: muscle.id,
          name: muscle.name,
          kind: muscle.kind,
          region: muscle.region,
          matchedVia,
        },
      });
    }
  }

  return [...scored.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.suggestion.name.localeCompare(b.suggestion.name);
    })
    .slice(0, limit)
    .map((item) => item.suggestion);
}

/** Dedupe + keep only known catalog ids (stable order of first appearance). */
export function normalizeTargetMuscleIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of ids) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    const resolved = byId.has(trimmed) ? trimmed : resolveMuscleId(trimmed);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    next.push(resolved);
  }
  return next;
}
