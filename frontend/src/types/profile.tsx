export type ProfileData = {
  steamId: string | undefined;
};

export const defaultProfileData: ProfileData = {
  steamId: undefined,
};

export type CreateProfile = {
  steamId: string;
};

export const defaultCreateProfile: CreateProfile = {
  steamId: "0",
};
