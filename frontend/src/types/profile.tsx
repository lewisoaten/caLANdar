export type UserGame = {
  appid: number;
  name: string;
  playtimeForever: number;
};

export const defaultUserGame: UserGame = {
  appid: 0,
  name: "",
  playtimeForever: 0,
};

export const defaultUserGames: UserGame[] = [defaultUserGame];

export type ProfileData = {
  steamId: string | undefined;
  games: UserGame[];
};

export const defaultProfileData: ProfileData = {
  steamId: "",
  games: defaultUserGames,
};

export type CreateProfile = {
  steamId: string;
};

export const defaultCreateProfile: CreateProfile = {
  steamId: "0",
};
