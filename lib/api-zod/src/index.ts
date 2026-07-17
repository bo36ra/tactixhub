export * from "./generated/api";
export * from "./generated/types";

// These two names exist both as Zod schemas (values, in ./generated/api) and
// as plain TS types (in ./generated/types). Star-exporting both files makes
// the names ambiguous (TS2308), so re-export them explicitly: the value from
// the zod file and the type from the types file. Value + type can share a
// name because they live in different declaration spaces.
export { SaveLineupBody, GetAttendanceScheduleParams, DeleteAttendanceDayParams } from "./generated/api";
export type {
  SaveLineupBody as SaveLineupBodyType,
  GetAttendanceScheduleParams as GetAttendanceScheduleParamsType,
  DeleteAttendanceDayParams as DeleteAttendanceDayParamsType,
} from "./generated/types";
