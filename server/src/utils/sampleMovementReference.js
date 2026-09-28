const SAMPLE_MOVEMENT_REFERENCE_PREFIX = "SM";
const SAMPLE_MOVEMENT_REFERENCE_WIDTH = 4;

const normalizePositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return parsed;
};

const normalizeReferenceYear = (value) => {
  const year = normalizePositiveInteger(value, "Reference year");
  if (year < 2000 || year > 9999) {
    throw new RangeError("Reference year must be between 2000 and 9999.");
  }
  return year;
};

const getSampleMovementCounterKey = (year) =>
  `sample-movement:${normalizeReferenceYear(year)}`;

const formatSampleMovementReference = ({ year, sequence }) => {
  const normalizedYear = normalizeReferenceYear(year);
  const normalizedSequence = normalizePositiveInteger(sequence, "Sequence");
  return `${SAMPLE_MOVEMENT_REFERENCE_PREFIX}-${normalizedYear}-${String(
    normalizedSequence,
  ).padStart(SAMPLE_MOVEMENT_REFERENCE_WIDTH, "0")}`;
};

const parseSampleMovementReference = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  const match = /^SM-(\d{4})-(\d{4,})$/.exec(normalized);
  if (!match) return null;

  const year = Number(match[1]);
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;

  return { reference: normalized, year, sequence };
};

module.exports = {
  SAMPLE_MOVEMENT_REFERENCE_PREFIX,
  SAMPLE_MOVEMENT_REFERENCE_WIDTH,
  formatSampleMovementReference,
  getSampleMovementCounterKey,
  parseSampleMovementReference,
};
