type RelationEntityType =
  | "CHARACTER"
  | "ORGANIZATION"
  | "PLACE"
  | "ITEM"
  | "CONCEPT"
  | "MAGIC_SYSTEM";
export type RelationDirection = "UNI" | "BI";

export type RelationType =
  | "ALLY"
  | "ENEMY"
  | "RIVAL"
  | "FAMILY"
  | "ROMANTIC"
  | "FRIEND"
  | "SERVES"
  | "MENTOR_OF"
  | "LEADER_OF"
  | "MEMBER_OF"
  | "SPECIES_OF"
  | "ORIGIN_OF"
  | "GOVERNS"
  | "LOCATED_IN"
  | "LOCATED_AT"
  | "BELONGS_TO"
  | "OWNS"
  | "CREATED_BY"
  | "USES"
  | "PROTECTS";

export type RelationSchemaEntry = {
  label: string;
  color: string;
  defaultDirection: RelationDirection;
  promptDescription: string;
  allowedPairs: ReadonlyArray<readonly [RelationEntityType, RelationEntityType]>;
  autoRegister?: boolean;
};

export const RELATION_SCHEMA: Record<RelationType, RelationSchemaEntry> = {
  ALLY: {
    label: "동맹",
    color: "#7dd3a8",
    defaultDirection: "BI",
    promptDescription: "동맹, 우호적 협력 관계",
    allowedPairs: [
      ["CHARACTER", "CHARACTER"],
      ["ORGANIZATION", "ORGANIZATION"],
      ["CONCEPT", "CONCEPT"],
    ],
  },
  ENEMY: {
    label: "적대",
    color: "#e85454",
    defaultDirection: "BI",
    promptDescription: "적대, 원수, 대립 관계",
    allowedPairs: [
      ["CHARACTER", "CHARACTER"],
      ["ORGANIZATION", "ORGANIZATION"],
      ["CONCEPT", "CONCEPT"],
    ],
  },
  RIVAL: {
    label: "경쟁",
    color: "#e8a838",
    defaultDirection: "BI",
    promptDescription: "경쟁자, 맞수 관계",
    allowedPairs: [
      ["CHARACTER", "CHARACTER"],
      ["CONCEPT", "CONCEPT"],
    ],
  },
  FAMILY: {
    label: "혈연",
    color: "#c98db8",
    defaultDirection: "BI",
    promptDescription: "가족, 혈연 관계",
    allowedPairs: [["CHARACTER", "CHARACTER"]],
  },
  ROMANTIC: {
    label: "연인",
    color: "#d97b8c",
    defaultDirection: "BI",
    promptDescription: "연인, 혼인, 로맨스 관계",
    allowedPairs: [["CHARACTER", "CHARACTER"]],
  },
  FRIEND: {
    label: "친구",
    color: "#8badd9",
    defaultDirection: "BI",
    promptDescription: "친구, 사적 유대 관계",
    allowedPairs: [["CHARACTER", "CHARACTER"]],
  },
  SERVES: {
    label: "주종",
    color: "#a0aabe",
    defaultDirection: "UNI",
    promptDescription: "주종·고용·복종 관계, 방향은 부하에서 상관",
    allowedPairs: [
      ["CHARACTER", "CHARACTER"],
      ["CHARACTER", "ORGANIZATION"],
    ],
  },
  MENTOR_OF: {
    label: "사제",
    color: "#c8a46e",
    defaultDirection: "UNI",
    promptDescription: "스승에서 제자로 향하는 사제 관계",
    allowedPairs: [["CHARACTER", "CHARACTER"]],
  },
  LEADER_OF: {
    label: "지휘",
    color: "#c8a46e",
    defaultDirection: "UNI",
    promptDescription: "리더에서 조직으로 향하는 지휘 관계",
    allowedPairs: [["CHARACTER", "ORGANIZATION"]],
    autoRegister: true,
  },
  MEMBER_OF: {
    label: "소속",
    color: "#8badd9",
    defaultDirection: "UNI",
    promptDescription: "구성원에서 조직 또는 종족으로 향하는 소속 관계",
    allowedPairs: [
      ["CHARACTER", "ORGANIZATION"],
      ["CHARACTER", "CONCEPT"],
    ],
    autoRegister: true,
  },
  SPECIES_OF: {
    label: "종족",
    color: "#9b8cd9",
    defaultDirection: "UNI",
    promptDescription: "캐릭터에서 종족 개념으로 향하는 종족 관계",
    allowedPairs: [["CHARACTER", "CONCEPT"]],
    autoRegister: true,
  },
  ORIGIN_OF: {
    label: "출신",
    color: "#6bc4c4",
    defaultDirection: "UNI",
    promptDescription: "캐릭터에서 출신 장소로 향하는 관계",
    allowedPairs: [["CHARACTER", "PLACE"]],
    autoRegister: true,
  },
  GOVERNS: {
    label: "통치",
    color: "#d4a86e",
    defaultDirection: "UNI",
    promptDescription: "캐릭터에서 통치·관할 장소로 향하는 관계",
    allowedPairs: [["CHARACTER", "PLACE"]],
    autoRegister: true,
  },
  LOCATED_IN: {
    label: "위치",
    color: "#6bc4c4",
    defaultDirection: "UNI",
    promptDescription: "장소·조직·아이템·개념이 더 큰 장소 안에 위치",
    allowedPairs: [
      ["PLACE", "PLACE"],
      ["ORGANIZATION", "PLACE"],
      ["ITEM", "PLACE"],
      ["CONCEPT", "PLACE"],
      ["CHARACTER", "PLACE"],
    ],
    autoRegister: true,
  },
  LOCATED_AT: {
    label: "위치",
    color: "#6bc4c4",
    defaultDirection: "UNI",
    promptDescription: "캐릭터나 아이템이 특정 장소에 있음",
    allowedPairs: [
      ["CHARACTER", "PLACE"],
      ["ITEM", "PLACE"],
      ["ORGANIZATION", "PLACE"],
    ],
    autoRegister: true,
  },
  BELONGS_TO: {
    label: "소속",
    color: "#8badd9",
    defaultDirection: "UNI",
    promptDescription: "아이템·장소·개념이 조직이나 캐릭터에 귀속",
    allowedPairs: [
      ["ITEM", "CHARACTER"],
      ["ITEM", "ORGANIZATION"],
      ["PLACE", "ORGANIZATION"],
      ["CONCEPT", "ORGANIZATION"],
    ],
    autoRegister: true,
  },
  OWNS: {
    label: "소유",
    color: "#d4a86e",
    defaultDirection: "UNI",
    promptDescription: "캐릭터나 조직이 아이템을 소유",
    allowedPairs: [
      ["CHARACTER", "ITEM"],
      ["ORGANIZATION", "ITEM"],
    ],
    autoRegister: true,
  },
  CREATED_BY: {
    label: "생성",
    color: "#c98db8",
    defaultDirection: "UNI",
    promptDescription: "아이템·개념·마법체계가 캐릭터나 조직에 의해 생성됨",
    allowedPairs: [
      ["ITEM", "CHARACTER"],
      ["ITEM", "ORGANIZATION"],
      ["CONCEPT", "CHARACTER"],
      ["MAGIC_SYSTEM", "CHARACTER"],
      ["MAGIC_SYSTEM", "ORGANIZATION"],
    ],
    autoRegister: true,
  },
  USES: {
    label: "사용",
    color: "#d4a86e",
    defaultDirection: "UNI",
    promptDescription: "캐릭터나 조직이 아이템·개념·마법체계를 사용",
    allowedPairs: [
      ["CHARACTER", "ITEM"],
      ["CHARACTER", "CONCEPT"],
      ["CHARACTER", "MAGIC_SYSTEM"],
      ["ORGANIZATION", "ITEM"],
      ["ORGANIZATION", "MAGIC_SYSTEM"],
    ],
    autoRegister: true,
  },
  PROTECTS: {
    label: "보호",
    color: "#7dd3a8",
    defaultDirection: "UNI",
    promptDescription: "캐릭터나 조직이 인물·장소·아이템을 보호",
    allowedPairs: [
      ["CHARACTER", "CHARACTER"],
      ["CHARACTER", "PLACE"],
      ["CHARACTER", "ITEM"],
      ["ORGANIZATION", "CHARACTER"],
      ["ORGANIZATION", "PLACE"],
    ],
    autoRegister: true,
  },
};

export const RELATION_TYPES = Object.keys(RELATION_SCHEMA) as RelationType[];

export const RELATION_COLORS = Object.fromEntries(
  RELATION_TYPES.map((type) => [type, RELATION_SCHEMA[type].color])
) as Record<string, string>;

export const RELATION_TYPE_LABELS = Object.fromEntries(
  RELATION_TYPES.map((type) => [type, RELATION_SCHEMA[type].label])
) as Record<string, string>;

export const AUTO_REGISTER_RELATION_TYPES = new Set(
  RELATION_TYPES.filter((type) => RELATION_SCHEMA[type].autoRegister)
) as Set<string>;

export function renderRelationPromptSpec(): string {
  return RELATION_TYPES.map((type) => {
    const entry = RELATION_SCHEMA[type];
    return `${type}(${entry.label}, ${entry.defaultDirection}): ${entry.promptDescription}`;
  }).join("\n");
}

export function renderRelationAllowedPairSpec(): string {
  return RELATION_TYPES.map((type) => {
    const entry = RELATION_SCHEMA[type];
    const pairs = entry.allowedPairs
      .map(([from, to]) => `${from} -> ${to}`)
      .join(", ");
    return `${type}: ${pairs}`;
  }).join("\n");
}

export function isKnownRelationType(value: string): value is RelationType {
  return Object.prototype.hasOwnProperty.call(RELATION_SCHEMA, value);
}

export function isAllowedRelationPair(
  fromType: string,
  toType: string,
  relationType: string
): boolean {
  if (!isKnownRelationType(relationType)) return false;
  return RELATION_SCHEMA[relationType].allowedPairs.some(
    ([from, to]) =>
      (from === fromType && to === toType) ||
      (RELATION_SCHEMA[relationType].defaultDirection === "BI" &&
        from === toType &&
        to === fromType)
  );
}
