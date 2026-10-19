/** Admin calls used by the Live page that go through existing endpoints. */
import { apiErrorFrom } from "../../utils/apiError";

export async function adminFetch(
  token: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`/api${path}${sep}as_admin=true`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await apiErrorFrom("Admin action failed", res);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
