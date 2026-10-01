/** Room editor requests (see API_CONTRACT §6). */
import { apiErrorFrom, ApiError } from "../../utils/apiError";
import type { ApiLayout, ApiRoom, LayoutSubmit } from "./layout";

/** Thrown when the API says the session is no longer valid. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

const jsonHeaders = (token: string | undefined) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: "Bearer " + token,
});

async function check(message: string, res: Response) {
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw await apiErrorFrom(message, res);
  return res;
}

export async function fetchEventTitle(eventId: number, token?: string) {
  const res = await check(
    "Couldn't load the event",
    await fetch(`/api/events/${eventId}?as_admin=true`, {
      headers: jsonHeaders(token),
    }),
  );
  const data = (await res.json()) as { title?: string };
  return data.title ?? "";
}

export async function fetchLayout(eventId: number, token?: string) {
  const res = await check(
    "Couldn't load the rooms",
    await fetch(`/api/events/${eventId}/room-layout?as_admin=true`, {
      headers: jsonHeaders(token),
    }),
  );
  return (await res.json()) as ApiLayout;
}

export async function saveLayout(
  eventId: number,
  body: LayoutSubmit,
  token?: string,
) {
  const res = await check(
    "Couldn't save the rooms",
    await fetch(`/api/events/${eventId}/room-layout?as_admin=true`, {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as ApiLayout;
}

/** Upload a background plan: the raw bytes with the file's type. */
export async function uploadBackground(
  eventId: number,
  roomId: number,
  file: File,
  token?: string,
) {
  const res = await check(
    "Couldn't upload the background",
    await fetch(
      `/api/events/${eventId}/rooms/${roomId}/background?as_admin=true`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
          "Content-Type": file.type,
        },
        body: file,
      },
    ),
  );
  return (await res.json()) as ApiRoom;
}

export async function deleteBackground(
  eventId: number,
  roomId: number,
  token?: string,
) {
  await check(
    "Couldn't remove the background",
    await fetch(
      `/api/events/${eventId}/rooms/${roomId}/background?as_admin=true`,
      { method: "DELETE", headers: jsonHeaders(token) },
    ),
  );
}

/** Clear a floorplan uploaded with the old editor (the room's `image`). */
export async function clearLegacyImage(
  eventId: number,
  room: Pick<ApiRoom, "id" | "name" | "description" | "sortOrder">,
  token?: string,
) {
  await check(
    "Couldn't remove the old floorplan",
    await fetch(`/api/events/${eventId}/rooms/${room.id}?as_admin=true`, {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        name: room.name,
        description: room.description,
        image: null,
        sortOrder: room.sortOrder,
      }),
    }),
  );
}

/** A message for the user explaining a failed upload. */
export function uploadErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 413)
      return "The image is larger than 5 MB. Choose a smaller file.";
    if (error.status === 415)
      return "That file isn't a PNG, JPEG, WebP or GIF image (its contents don't match its type).";
    if (error.status >= 400 && error.status < 500 && error.description)
      return error.description;
  }
  return "The upload failed. Check your connection and try again.";
}
