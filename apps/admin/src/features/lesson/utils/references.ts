// A Lesson Source's page and section references: the form that edits them and the request that saves them.
import type {
  LessonDetail,
  UpsertLessonSourceRequest,
} from "@ez-dk-citizen/api-contracts/schemas";

import type {
  Field,
  FieldErrors,
  Values,
} from "../../../shared/components/EditForm";

type LessonSource = LessonDetail["lessonSources"][number];
// Every reference is always sent, so none is left optional.
type References = Required<UpsertLessonSourceRequest>;

export const referenceFields: Field[] = [
  { name: "pageFrom", label: "Page from", kind: "number", optional: true },
  { name: "pageTo", label: "Page to", kind: "number", optional: true },
  {
    name: "sectionReference",
    label: "Section reference",
    kind: "text",
    optional: true,
  },
];

// Attaching sends every reference, because the backend replaces all three on each save.
export const noReferences: References = {
  pageFrom: null,
  pageTo: null,
  sectionReference: null,
};

export function toReferenceValues(source: LessonSource): Values {
  return {
    pageFrom: String(source.pageFrom ?? ""),
    pageTo: String(source.pageTo ?? ""),
    sectionReference: source.sectionReference ?? "",
  };
}

// Blank means no reference; the form has already checked that pages are positive whole numbers.
export function toReferenceRequest({
  pageFrom,
  pageTo,
  sectionReference,
}: Values): References {
  return {
    pageFrom: pageFrom?.trim() ? Number(pageFrom) : null,
    pageTo: pageTo?.trim() ? Number(pageTo) : null,
    sectionReference: sectionReference?.trim() || null,
  };
}

export function validateReferences(values: Values): FieldErrors {
  const { pageFrom, pageTo } = toReferenceRequest(values);
  return pageFrom !== null && pageTo !== null && pageTo < pageFrom
    ? { pageTo: "Page to must not be below page from." }
    : {};
}
