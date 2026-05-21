export interface ProjectConfig {
  email: string;
  password: string;
  mobileId?: string;
  sessionFile: string;
  applianceCacheFile?: string;
  forceApplianceCacheRefresh?: boolean;
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
