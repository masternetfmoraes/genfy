export class EntitlementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}
