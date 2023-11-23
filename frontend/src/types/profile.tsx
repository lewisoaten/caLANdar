export type ProfileData = {
  steamId: string | undefined;
  games: UserGame[];
};

export const defaultProfileData: ProfileData = {
  steamId: undefined,
  games: [],
};

export type CreateProfile = {
  steamId: string;
};

export const defaultCreateProfile: CreateProfile = {
  steamId: "0",
};

export type UserGame = {
  appid: number;
  playtime_forever: number;
};

export const defaultUserGames: UserGame[] = [];

export const defaultUserGame: UserGame = {
  appid: 0,
  playtime_forever: 0,
};
