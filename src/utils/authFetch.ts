import { fetchAuthSession } from "aws-amplify/auth";

// fetch() that adds the signed-in user's Cognito ID token so the server can
// verify who is calling. Throws if there is no real Cognito session.
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error("Please sign in again");
  }
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
