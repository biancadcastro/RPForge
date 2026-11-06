// Stable, machine-readable failures. Codes are part of the integration contract
// (docs/animation-engine/INTEGRATION.md): never rename an existing code.
export const ErrorCode = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',               // caller data violates the profile schema
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',           // compressed input above the limit
  OUTPUT_TOO_LARGE: 'OUTPUT_TOO_LARGE',         // encoded result above the limit
  INVALID_ENVELOPE: 'INVALID_ENVELOPE',         // RSC7 magic/version/flags/page layout
  DECOMPRESSION_FAILED: 'DECOMPRESSION_FAILED', // corrupt deflate stream, size mismatch or trailing data
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',             // a count/size derived from the file is above the budget
  POINTER_OUT_OF_RANGE: 'POINTER_OUT_OF_RANGE', // pointer/offset/length outside its region
  INCONSISTENT_REFERENCE: 'INCONSISTENT_REFERENCE', // counts, hashes or cross references disagree
  CYCLE: 'CYCLE',                               // linked list or hierarchy loops
  OVERLAPPING_BLOCKS: 'OVERLAPPING_BLOCKS',     // two structures share bytes
  UNREFERENCED_DATA: 'UNREFERENCED_DATA',       // non-zero bytes outside every validated structure (strict mode)
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',               // non-default value in a field the profile does not understand
  UNSUPPORTED_STRUCTURE: 'UNSUPPORTED_STRUCTURE', // known variant outside the selected profile
  UNSUPPORTED_CHANNEL: 'UNSUPPORTED_CHANNEL',   // channel type/layout not decodable or not writable
  NONFINITE_VALUE: 'NONFINITE_VALUE',           // NaN/Infinity in a decoded or supplied value
  INVALID_QUATERNION: 'INVALID_QUATERNION',     // zero/denormal length or not unit within tolerance
  ROTATION_ENCODING: 'ROTATION_ENCODING',       // no continuity-preserving cached encoding exists
  SKELETON_INVALID: 'SKELETON_INVALID',         // reference skeleton malformed (duplicates, cycles, missing parent)
  SKELETON_MISMATCH: 'SKELETON_MISMATCH',       // animation references bones absent or ambiguous in the skeleton
  CANCELLED: 'CANCELLED',                       // caller signal aborted between stages
});

export class EngineError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
  toJSON() { return {code: this.code, message: this.message, ...(this.details === undefined ? {} : {details: this.details})}; }
}

export function fail(code, message, details) { throw new EngineError(code, message, details); }
export function ensure(condition, code, message, details) { if (!condition) throw new EngineError(code, message, details); }

/** Non-throwing wrapper used by the public operations: {ok:true,...} or {ok:false,error}. */
export function toFailure(error) {
  if (error instanceof EngineError) return {ok: false, error: error.toJSON()};
  // Anything else is an engine defect, never a format verdict. Do not leak stack traces.
  return {ok: false, error: {code: 'INTERNAL', message: 'Unexpected engine failure'}};
}
