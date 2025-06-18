export const isValidEmail = (email) => {
  // Checks for: one or more non-space/non-@ chars, then @, then one or more non-space/non-@ chars, then ., then one or more non-space/non-@ chars
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password) => {
  return password.length >= 8;
};
