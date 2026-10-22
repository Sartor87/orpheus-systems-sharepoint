/** The user must sign in again or consent (OBO could not mint a SharePoint token). Mapped to HTTP 401. */
export class AuthRequiredError extends Error {
  constructor(message = 'Interactive sign-in or consent required.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
