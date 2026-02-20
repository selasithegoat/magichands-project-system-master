export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_STRENGTH_MESSAGE =
  "Use at least 8 characters, including 1 uppercase letter and 1 special character (@$!%*?&).";

const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const PASSWORD_SPECIAL_CHAR_PATTERN = /[@$!%*?&]/;

const normalizePassword = (value) =>
  typeof value === "string" ? value : "";

export const getPasswordStrengthScore = (value) => {
  const password = normalizePassword(value);
  let strength = 0;

  if (password.length > 5) strength += 33;
  if (password.length > 7 && PASSWORD_UPPERCASE_PATTERN.test(password)) {
    strength += 33;
  }
  if (PASSWORD_SPECIAL_CHAR_PATTERN.test(password)) strength += 34;

  return strength > 100 ? 100 : strength;
};

export const getPasswordStrengthLabel = (score) => {
  if (score < 40) return "Weak";
  if (score < 80) return "Medium";
  return "Strong";
};

export const isPasswordStrongEnough = (value) =>
  getPasswordStrengthScore(value) >= 100;
