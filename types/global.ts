export interface ProjectConfig {
  email: string;
  password: string;
  mobileId?: string;
  sessionFile: string;
  debug?: boolean;
  requestLogging?: boolean;
}

export interface HonSessionData {
  refreshToken: string;
  sessionToken: string;
  idToken?: string;
  accessToken?: string;
  expiresAt?: string;
  updatedAt?: string;
}
