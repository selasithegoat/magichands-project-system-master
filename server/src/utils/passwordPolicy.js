const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const PASSWORD_SPECIAL_CHAR_PATTERN = /[@$!%*?&]/;

const PASSWORD_STRENGTH_MESSAGE =
  "Password must be at least 8 characters and include at least one uppercase letter and one special character (@$!%*?&).";

const normalizePassword = (value) =>
  typeof value === "string" ? value : "";

const getPasswordStrengthScore = (value) => {
  const password = normalizePassword(value);
  let strength = 0;

  if (password.length > 5) strength += 33;
  if (password.length > 7 && PASSWORD_UPPERCASE_PATTERN.test(password)) {
    strength += 33;
  }
  if (PASSWORD_SPECIAL_CHAR_PATTERN.test(password)) strength += 34;

  return strength > 100 ? 100 : strength;
};

const validatePasswordStrength = (value) => {
  const strength = getPasswordStrengthScore(value);

  if (strength < 100) {
    return {
      valid: false,
      message: PASSWORD_STRENGTH_MESSAGE,
    };
  }

  return {
    valid: true,
    message: "",
  };
};

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_MESSAGE,
  getPasswordStrengthScore,
  validatePasswordStrength,
};
